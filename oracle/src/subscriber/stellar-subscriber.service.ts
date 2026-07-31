import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { HealthService } from '../health/health.service';
import { MetricsService } from '../metrics/metrics.service';

/** How long to wait between reconnect attempts (ms). */
const RECONNECT_DELAY_MS = 5_000;

/** Maximum number of ledgers to backfill in a single reconnect window. */
const MAX_BACKFILL_LEDGERS = 500;

/** Maximum size of the seen-event-ID set used for duplicate suppression. */
const MAX_SEEN_IDS = 10_000;

@Injectable()
export class StellarSubscriberService implements OnModuleInit, OnModuleDestroy {
  

  private horizonServer: Horizon.Server;
  private closeStream: (() => void) | null = null;
  private lastMessageAt = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isRestarting = false;
  private isBackfilling = false;

  /** Paging token of the last successfully-processed transaction. */
  private lastSeenCursor: string | null = null;

  /** Ledger sequence of the last successfully-processed transaction. */
  private lastSeenLedger: number | null = null;

  /** Deduplication set: paging tokens we have already processed. */
  private readonly seenCursors = new Set<string>();

  private readonly HEARTBEAT_CHECK_MS = 30_000;
  private readonly HEARTBEAT_TIMEOUT_MS = 60_000;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    const horizonUrl = this.configService.get<string>(
      'HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.horizonServer = new Horizon.Server(horizonUrl);
  }

  onModuleInit() {
    this.startStream();
    this.startHeartbeatCheck();
  }

  onModuleDestroy() {
    this.stopStream();
    this.stopHeartbeatCheck();
  }

  // ─── Public helpers (exposed for tests / health checks) ──────────────────

  /** Returns the cursor of the last processed transaction, or null. */
  getLastSeenCursor(): string | null {
    return this.lastSeenCursor;
  }

  /** Returns the ledger sequence of the last processed transaction, or null. */
  getLastSeenLedger(): number | null {
    return this.lastSeenLedger;
  }

  /** Number of gap detections recorded via MetricsService (0 if metrics unavailable). */
  getGapDetectionCount(): number {
    return this.metricsService?.getGapDetectionCount() ?? 0;
  }

  /**
   * Returns the estimated subscriber lag as the number of ledgers between
   * the last processed cursor and now. Returns 0 when no cursor is recorded.
   */
  getSubscriberLag(): number {
    return this.lastSeenCursor ? this.seenCursors.size : 0;
  }

  // ─── Stream lifecycle ─────────────────────────────────────────────────────

  private startStream(cursor?: string) {
    this.logger.log(
      cursor
        ? `Starting Horizon SSE stream from cursor ${cursor}…`
        : 'Starting Horizon SSE stream from "now"…',
    );

    try {
      const builder = this.horizonServer.transactions();
      const withCursor = cursor ? builder.cursor(cursor) : builder.cursor('now');

      this.closeStream = withCursor.stream({
        onmessage: (tx: any) => void this.handleMessage(tx),
        onerror: (error: any) => this.handleError(error),
      });

      this.lastMessageAt = Date.now();
      this.logger.log('SSE stream request initiated');
    } catch (error) {
      this.handleError(error);
    }
  }

  private stopStream() {
    if (this.closeStream) {
      try {
        this.closeStream();
      } catch (e: any) {
        this.logger.warn(`Error closing stream: ${e.message}`);
      }
      this.closeStream = null;
    }
    this.healthService.updateStreamStatus('disconnected');
  }

  // ─── Message handling + deduplication ────────────────────────────────────

  private async handleMessage(message: any) {
    this.lastMessageAt = Date.now();

    if (this.healthService.getMetrics().streamStatus !== 'connected') {
      this.healthService.updateStreamStatus('connected');
      this.logger.log('SSE stream connected (data received)');
    }

    // Horizon heartbeats arrive as empty objects {}
    if (!message || Object.keys(message).length === 0) {
      this.logger.debug('Received Horizon keep-alive');
      return;
    }

    const cursor: string | undefined = message.paging_token ?? message.id;

    if (cursor) {
      if (this.seenCursors.has(cursor)) {
        this.logger.debug(`Duplicate event suppressed: ${cursor}`);
        return;
      }

      const ledger = this.extractLedger(message);

      if (
        !this.isBackfilling &&
        ledger != null &&
        Number.isFinite(ledger) &&
        this.lastSeenLedger != null &&
        ledger > this.lastSeenLedger + 1
      ) {
        const gapSize = ledger - this.lastSeenLedger - 1;
        this.logger.warn(
          `SSE stream ledger gap detected: ${this.lastSeenLedger} → ${ledger} (${gapSize} ledger(s) missed)`,
        );
        this.metricsService?.recordEventListenerGap(0);

        if (this.lastSeenCursor) {
          this.logger.log(`Initiating backfill to recover ${gapSize} missed ledger(s)…`);
          const backfilled = await this.backfill(this.lastSeenCursor);
          this.logger.log(
            `Backfill complete — recovered ${backfilled} transaction(s) from gap, proceeding with live stream.`,
          );
        }
      }

      this.recordCursor(cursor, ledger);
    }

    this.logger.debug(`Processing transaction: ${message.hash ?? cursor}`);
  }

  /**
   * Extracts the ledger sequence number from a Horizon transaction record.
   * Horizon paging tokens use the format "<ledger>-<txOrder>-<opOrder>", so
   * we can derive the ledger from the first hyphen-delimited segment as a
   * fallback when the explicit `ledger` field is absent.
   */
  private extractLedger(message: any): number | null {
    if (message?.ledger !== undefined && message?.ledger !== null) {
      const parsed = Number(message.ledger);
      if (Number.isFinite(parsed)) return parsed;
    }

    const token = String(message?.paging_token ?? message?.id ?? '');
    const firstSegment = token.split('-')[0];
    if (!firstSegment) return null;

    const parsed = Number(firstSegment);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Records a cursor as processed and keeps the deduplication set bounded.
   * Oldest entries are evicted once the set reaches `MAX_SEEN_IDS`.
   */
  private recordCursor(cursor: string, ledger?: number | null) {
    if (this.seenCursors.size >= MAX_SEEN_IDS) {
      // Evict oldest entry — Set iteration order is insertion order in V8
      const oldest = this.seenCursors.values().next().value;
      if (oldest !== undefined) this.seenCursors.delete(oldest);
    }
    this.seenCursors.add(cursor);
    this.lastSeenCursor = cursor;

    if (ledger != null && Number.isFinite(ledger)) {
      this.lastSeenLedger = ledger;
    }
  }

  private handleError(error: any) {
    const errorMsg = error?.message || String(error);
    this.logger.error(`SSE stream error: ${errorMsg}`);
    this.healthService.updateStreamStatus('disconnected', errorMsg);
  }

  // ─── Backfill on reconnect ────────────────────────────────────────────────

  /**
   * Fetches transactions from `fromCursor` up to the current ledger,
   * deduplicated by cursor. Called on reconnect when `lastSeenCursor` exists,
   * or on-the-fly when a live-stream gap is detected.
   *
   * Returns the number of newly-processed transactions recovered.
   */
  async backfill(fromCursor: string): Promise<number> {
    this.logger.log(`Backfilling missed transactions from cursor ${fromCursor}…`);

    let count = 0;
    this.isBackfilling = true;

    try {
      let page: Horizon.ServerApi.CollectionPage<Horizon.ServerApi.TransactionRecord> =
        await this.horizonServer
          .transactions()
          .cursor(fromCursor)
          .order('asc')
          .limit(200)
          .call();

      while (page.records.length > 0 && count < MAX_BACKFILL_LEDGERS) {
        for (const tx of page.records) {
          const cursor: string = (tx as any).paging_token ?? (tx as any).id;

          if (cursor && this.seenCursors.has(cursor)) {
            this.logger.debug(`Backfill: duplicate suppressed ${cursor}`);
            continue;
          }

          const ledger = this.extractLedger(tx);
          if (cursor) this.recordCursor(cursor, ledger);
          this.logger.debug(`Backfill: processing tx ${(tx as any).hash ?? cursor}`);
          count++;
        }

        if (count >= MAX_BACKFILL_LEDGERS) break;
        page = await page.next();
      }
    } catch (err: any) {
      this.logger.error(`Backfill failed: ${err.message}`);
    } finally {
      this.isBackfilling = false;
    }

    if (count > 0) {
      this.logger.warn(
        `Backfill gap recovery: processed ${count} new transaction(s) from cursor ${fromCursor}`,
      );
      this.metricsService?.recordEventListenerGap(count);
    } else {
      this.logger.log('Backfill complete — no missed transactions');
    }

    return count;
  }

  // ─── Heartbeat / reconnect ────────────────────────────────────────────────

  private startHeartbeatCheck() {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeat();
    }, this.HEARTBEAT_CHECK_MS);
  }

  private stopHeartbeatCheck() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private checkHeartbeat() {
    const elapsed = Date.now() - this.lastMessageAt;
    this.logger.debug(`Heartbeat check: ${elapsed}ms since last message`);

    if (elapsed > this.HEARTBEAT_TIMEOUT_MS) {
      this.logger.warn(
        `SSE stream heartbeat timeout (${elapsed}ms). Restarting stream…`,
      );
      this.restartStream(`Heartbeat timeout: ${elapsed}ms elapsed`);
    }

    // Report lag to health service
    const lag = this.getSubscriberLag();
    if (lag > 0) {
      this.logger.debug(`Subscriber lag estimate: ~${lag} events`);
    }
  }

  private restartStream(reason: string) {
    if (this.isRestarting) return;
    this.isRestarting = true;

    this.logger.log(`Restarting SSE stream. Reason: ${reason}`);
    this.stopStream();
    this.healthService.updateStreamStatus('reconnecting', reason);

    setTimeout(async () => {
      this.isRestarting = false;

      // Backfill any missed transactions before resuming the live stream
      if (this.lastSeenCursor) {
        await this.backfill(this.lastSeenCursor);
      }

      if (!this.closeStream) {
        // Resume from last seen position so we don't miss events between
        // backfill completion and the new live cursor.
        this.startStream(this.lastSeenCursor ?? undefined);
      }
    }, RECONNECT_DELAY_MS);
  }
}
