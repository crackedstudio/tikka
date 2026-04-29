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

  // Reconnection & Backoff
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
      `Starting Ledger Poller for contracts: ${this.contractIds.join(", ")}`,
    );
    this.isRunning = true;
    this.startIngestion();
  }

  onModuleDestroy() {
    this.logger.log("Stopping Ledger Poller...");
    this.isRunning = false;
    this.stopIngestion();
  }

  /**
   * Main entry point for starting the ingestion process.
   * Attempts to use SSE for real-time updates.
   */
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

  /**
   * Connects to the Horizon SSE stream for events.
   */
  private startSse(cursor: string) {
    this.stopIngestion();

    this.logger.log(`Connecting to Horizon SSE stream...`);

    try {
      // Subscribe to the Horizon /events stream. 
      // Note: We filter by contract_id in the message handler to support multiple contracts.
      this.sseCloseFn = (this.horizonServer as any)
        .events()
        .cursor(cursor)
        .stream({
          onmessage: (event: any) => this.handleRawEvent(event),
          onerror: (error: any) => {
            this.logger.warn(
              `SSE Stream Error or Disconnect. Falling back to polling...`,
            );
            this.logger.debug(`SSE Error details: ${JSON.stringify(error)}`);
            this.schedulePollingFallback();
          },
        });
    } catch (error) {
      this.logger.error(`Failed to initialize SSE: ${error.message}`);
      this.schedulePollingFallback();
    }
  }

  /**
   * Internal handler for raw event payloads from Horizon.
   */
  private handleRawEvent(rawEvent: any) {
    // Filter by contract IDs if configured
    const eventContractId =
      rawEvent.contract_id || rawEvent.contractId || rawEvent.address;

    if (this.contractIds.length > 0 && !this.contractIds.includes(eventContractId)) {
      return;
    }

    this.logger.debug(
      `Received event: ${rawEvent.id} (Ledger ${rawEvent.ledger})`,
    );
    this.processEvent(rawEvent);
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

      const parsed = this.eventParser.parse(rawSorobanEvent as any);
      if (!parsed) return;

      const queryRunner = await this.dispatcher.dispatch(parsed, rawEvent);

      const nextToken = rawEvent.paging_token || rawEvent.id;

      if (this.dryRun.enabled) {
        this.logger.log(
          `[DRY-RUN] Would save cursor: ledger=${ledger} token=${nextToken}`,
        );
        if (queryRunner) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
        }
        return;
      }

      await this.cursorManager.saveCursor(ledger, ledgerHash, nextToken, queryRunner ?? undefined);

      if (queryRunner) {
        await queryRunner.commitTransaction();
        await queryRunner.release();
      }
    } catch (error) {
      // queryRunner already released by dispatcher on error
      this.logger.warn(
        `Failed to process event ${rawEvent.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Switches to polling mode if SSE fails.
   */
  private schedulePollingFallback() {
    if (!this.isRunning) return;
    this.stopIngestion();
    this.logger.warn(`Switching to polling fallback loop...`);
    this.pollOnce();
  }

  /**
   * A single polling request to Horizon /events.
   */
  private async pollOnce() {
    if (!this.isRunning) return;

    try {
      const cursor = await this.cursorManager.getCursor();
      const lastToken = cursor?.lastPagingToken || "now";

      const response = await (this.horizonServer as any)
        .events()
        .cursor(lastToken)
        .limit(100)
        .call();

      if (response.records && response.records.length > 0) {
        this.logger.log(`Polled ${response.records.length} events from Horizon`);
        for (const record of response.records) {
          this.handleRawEvent(record);
        }
      }

      // Reset retry attempt on any successful communication
      this.retryAttempt = 0;

      // If we got a full page, poll again soon; otherwise wait 5 seconds
      const nextDelay = response.records.length === 100 ? 500 : 5000;
      this.pollingTimeout = setTimeout(() => this.pollOnce(), nextDelay);
    } catch (error) {
      this.logger.error(
        `Polling error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleReconnection();
      this.metrics.incrementEventsProcessed(response.events.length);
    }
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   */
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

    this.pollingTimeout = setTimeout(() => this.startIngestion(), delay);
  }

  /**
   * Cleans up active listeners and timers.
   */
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
