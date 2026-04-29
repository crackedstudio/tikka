import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Horizon } from "@stellar/stellar-sdk";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserV2Service } from "./event-parser-v2.service";
import { DryRunService } from "./dry-run.service";
import { IngestionDispatcherService } from "./ingestion-dispatcher.service";
import { MetricsService } from "../metrics/metrics.service";
import { ReorgRollbackService } from "./reorg-rollback.service";

@Injectable()
export class LedgerPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerPollerService.name);
  private horizonServer: Horizon.Server;
  private contractIds: string[];
  private isRunning = false;
  private sseCloseFn?: () => void;
  private pollingTimeout?: NodeJS.Timeout;

  private readonly batchSize: number;
  private eventBuffer: Array<{ parsed: DomainEvent; raw: Record<string, unknown> }> =
    [];
  /** Serializes ingestion so batches commit in order. */
  private chain: Promise<void> = Promise.resolve();

  private retryAttempt = 0;
  private readonly MAX_RETRY_DELAY = 30000;
  private readonly BASE_RETRY_DELAY = 2000;
  private readonly safetyDepth: number;

  constructor(
    private configService: ConfigService,
    private cursorManager: CursorManagerService,
    private eventParser: EventParserV2Service,
    private dryRun: DryRunService,
    private dispatcher: IngestionDispatcherService,
    private metrics: MetricsService,
    private reorgRollback: ReorgRollbackService,
  ) {
    const horizonUrl =
      this.configService.get<string>("HORIZON_URL") ||
      "https://horizon-testnet.stellar.org";
    this.horizonServer = new Horizon.Server(horizonUrl);

    const idsString = this.configService.get<string>("TIKKA_CONTRACT_ID") || "";
    this.contractIds = idsString
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    this.safetyDepth = this.configService.get<number>("REORG_SAFETY_DEPTH", 5);
  }

  async onModuleInit() {
    if (this.contractIds.length === 0) {
      this.logger.warn(
        "No contract IDs configured. Indexer will not ingest events.",
      );
      return;
    }
    this.logger.log(
      `Starting Ledger Poller for contracts: ${this.contractIds.join(", ")} (batch size ${this.batchSize})`,
    );
    this.isRunning = true;
    this.startIngestion();
  }

  async onModuleDestroy() {
    this.logger.log("Stopping Ledger Poller...");
    this.isRunning = false;
    this.stopIngestion();
    try {
      await this.chain;
      await this.flushRemainder();
    } catch (error) {
      this.logger.warn(
        `Error while flushing ingestion buffer on shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async startIngestion() {
    if (!this.isRunning) return;

    try {
      const cursor = await this.cursorManager.getCursor();
      const lastToken = cursor?.lastPagingToken || "now";

      this.logger.log(`Starting ingestion from cursor: ${lastToken}`);
      this.startSse(lastToken);
    } catch (error) {
      this.logger.error(
        `Failed to start ingestion: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleReconnection();
    }
  }

  private startSse(cursor: string) {
    this.stopIngestion();

    this.logger.log(`Connecting to Horizon SSE stream...`);

    try {
      this.sseCloseFn = (this.horizonServer as unknown as {
        events: () => {
          cursor: (c: string) => {
            stream: (handlers: {
              onmessage: (event: unknown) => void;
              onerror: (error: unknown) => void;
            }) => () => void;
          };
        };
      })
        .events()
        .cursor(cursor)
        .stream({
          onmessage: (event: unknown) => this.enqueueRawEvent(event),
          onerror: (error: unknown) => {
            this.logger.warn(
              `SSE Stream Error or Disconnect. Falling back to polling...`,
            );
            this.logger.debug(`SSE Error details: ${JSON.stringify(error)}`);
            this.schedulePollingFallback();
          },
        });
    } catch (error) {
      this.logger.error(
        `Failed to initialize SSE: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.schedulePollingFallback();
    }
  }

  /**
   * Queue a Horizon event for sequential decode + batched dispatch.
   */
  private enqueueRawEvent(rawEvent: unknown): void {
    const ev = rawEvent as Record<string, unknown>;
    const eventContractId =
      (ev.contract_id as string) ||
      (ev.contractId as string) ||
      (ev.address as string);

    if (
      this.contractIds.length > 0 &&
      !this.contractIds.includes(eventContractId)
    ) {
      return;
    }

    this.logger.debug(
      `Received event: ${ev.id as string} (Ledger ${ev.ledger as string})`,
    );

    this.chain = this.chain
      .then(() => this.ingestRawEvent(ev))
      .catch((error: unknown) => {
        this.metrics.incrementErrors(1);
        this.logger.warn(
          `Ingestion chain error: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /**
   * Decodes, parses, and dispatches the event, then updates the cursor atomically.
   * Checks for ledger reorgs before processing and enforces safety depth.
   */
  private async processEvent(rawEvent: any): Promise<void> {
    try {
      const ledger = Number(rawEvent.ledger);
      const ledgerHash: string = rawEvent.ledger_hash || rawEvent.ledgerHash || '';

      // --- Reorg detection ---
      if (ledgerHash) {
        const reorgAt = await this.cursorManager.checkForReorg(ledger, ledgerHash);
        if (reorgAt !== null) {
          this.logger.error(`Reorg detected at ledger ${reorgAt} — rolling back`);
          this.metrics.incrementReorgDetected();
          await this.reorgRollback.rollback(reorgAt);
          return;
        }
      }

      // --- Safety depth: skip events from ledgers not yet confirmed ---
      const cursor = await this.cursorManager.getCursor();
      const networkLedger = ledger; // the event's ledger is the "tip"
      if (cursor && networkLedger - cursor.lastLedger < this.safetyDepth) {
        this.logger.debug(
          `Skipping ledger ${ledger}: within safety depth (${this.safetyDepth})`,
        );
        return;
      }

      // Map Horizon event fields to the format expected by EventParserService
      const rawSorobanEvent = {
        type: rawEvent.type || "contract",
        topics: rawEvent.topic || rawEvent.topics || [],
        value: rawEvent.value || "",
        contractId: rawEvent.contract_id || rawEvent.contractId || rawEvent.address,
      };

    this.eventBuffer.push({ parsed, raw: rawEvent });

    while (this.eventBuffer.length >= this.batchSize) {
      const batch = this.eventBuffer.splice(0, this.batchSize);
      await this.processBatch(batch);
    }
  }

  private async flushRemainder(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }
    const batch = this.eventBuffer.splice(0, this.eventBuffer.length);
    await this.processBatch(batch);
  }

  private async processBatch(
    batch: Array<{ parsed: DomainEvent; raw: Record<string, unknown> }>,
  ): Promise<void> {
    if (batch.length === 0) {
      return;
    }

    const lastRaw = batch[batch.length - 1].raw;
    const lastId = lastRaw.id as string | undefined;

    try {
      const queryRunner = await this.dispatcher.dispatchBatch(
        batch.map((b) => ({ event: b.parsed, raw: b.raw })),
      );

      const nextToken = (lastRaw.paging_token as string | undefined) || lastId;
      const ledger = Number(lastRaw.ledger);

      if (this.dryRun.enabled) {
        this.logger.log(
          `[DRY-RUN] Would save cursor: ledger=${ledger} token=${nextToken}`,
        );
        if (queryRunner) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
        }
        this.metrics.incrementEventsProcessed(batch.length);
        return;
      }

      await this.cursorManager.saveCursor(ledger, ledgerHash, nextToken, queryRunner ?? undefined);

      if (queryRunner) {
        await queryRunner.commitTransaction();
        await queryRunner.release();
      }

      this.metrics.incrementEventsProcessed(batch.length);
    } catch (error) {
      this.metrics.incrementErrors(1);
      this.logger.warn(
        `Failed to process batch ending ${lastId ?? "?"}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private schedulePollingFallback() {
    if (!this.isRunning) return;
    this.stopIngestion();
    this.logger.warn(`Switching to polling fallback loop...`);
    void this.pollOnce();
  }

  private async pollOnce() {
    if (!this.isRunning) return;

    try {
      const cursor = await this.cursorManager.getCursor();
      const lastToken = cursor?.lastPagingToken || "now";

      const response = await (this.horizonServer as unknown as {
        events: () => {
          cursor: (c: string) => {
            limit: (n: number) => { call: () => Promise<{ records?: unknown[] }> };
          };
        };
      })
        .events()
        .cursor(lastToken)
        .limit(100)
        .call();

      const records = response.records ?? [];

      if (records.length > 0) {
        this.logger.log(`Polled ${records.length} events from Horizon`);
        for (const record of records) {
          this.enqueueRawEvent(record);
        }
        await this.chain;
        await this.flushRemainder();
      }

      this.retryAttempt = 0;

      const nextDelay = records.length === 100 ? 500 : 5000;
      this.pollingTimeout = setTimeout(() => void this.pollOnce(), nextDelay);
    } catch (error) {
      this.logger.error(
        `Polling error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.metrics.incrementErrors(1);
      this.scheduleReconnection();
    }
  }

  private scheduleReconnection() {
    if (!this.isRunning) return;
    this.stopIngestion();

    const delay = Math.min(
      this.BASE_RETRY_DELAY * Math.pow(2, this.retryAttempt),
      this.MAX_RETRY_DELAY,
    );

    this.logger.log(
      `Reconnecting in ${delay}ms (attempt ${this.retryAttempt + 1})...`,
    );
    this.retryAttempt++;

    this.pollingTimeout = setTimeout(() => void this.startIngestion(), delay);
  }

  private stopIngestion() {
    if (this.sseCloseFn) {
      this.sseCloseFn();
      this.sseCloseFn = undefined;
    }
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = undefined;
    }
  }
}
