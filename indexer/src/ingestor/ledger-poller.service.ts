import {
  Inject,
  Injectable,
  Logger,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Horizon } from "@stellar/stellar-sdk";
import { CursorManagerService } from "./cursor-manager.service";
import { EVENT_PARSER, IEventParser } from "./event-parser.interface";
import { DryRunService } from "./dry-run.service";
import { IngestionDispatcherService } from "./ingestion-dispatcher.service";
import { DomainEvent } from "./event.types";
import { MetricsService } from "../metrics/metrics.service";
import { ReorgRollbackService } from "./reorg-rollback.service";
import { PipelineStateMachine, PipelineTransition } from "./pipeline-state";
import {
  PollingConfig,
  DEFAULT_POLLING_CONFIG,
  calculateNextInterval,
  isRateLimitError,
  isTransientError,
} from "./polling-config";

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
  private chain: Promise<void> = Promise.resolve();

  private readonly pollingConfig: PollingConfig;
  private backoffLevel = 0;
  private currentLagLedgers = 0;
  private readonly safetyDepth: number;

  constructor(
    private configService: ConfigService,
    private cursorManager: CursorManagerService,
    @Inject(EVENT_PARSER) private eventParser: IEventParser,
    private dryRun: DryRunService,
    private dispatcher: IngestionDispatcherService,
    private metrics: MetricsService,
    private reorgRollback: ReorgRollbackService,
    @Optional() private pipeline?: PipelineStateMachine,
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

    this.batchSize = this.configService.get<number>("INGESTION_BATCH_SIZE", 25);
    this.safetyDepth = this.configService.get<number>("REORG_SAFETY_DEPTH", 5);

    // Load polling configuration from environment or use defaults
    this.pollingConfig = {
      minIntervalMs: this.configService.get<number>(
        "POLLING_MIN_INTERVAL_MS",
        DEFAULT_POLLING_CONFIG.minIntervalMs,
      ),
      maxIntervalMs: this.configService.get<number>(
        "POLLING_MAX_INTERVAL_MS",
        DEFAULT_POLLING_CONFIG.maxIntervalMs,
      ),
      maxBatchSize: this.configService.get<number>(
        "POLLING_MAX_BATCH_SIZE",
        DEFAULT_POLLING_CONFIG.maxBatchSize,
      ),
      lagThresholdLedgers: this.configService.get<number>(
        "POLLING_LAG_THRESHOLD_LEDGERS",
        DEFAULT_POLLING_CONFIG.lagThresholdLedgers,
      ),
      rateLimitBackoffMultiplier: this.configService.get<number>(
        "POLLING_RATE_LIMIT_BACKOFF_MULTIPLIER",
        DEFAULT_POLLING_CONFIG.rateLimitBackoffMultiplier,
      ),
      transientErrorBackoffMultiplier: this.configService.get<number>(
        "POLLING_TRANSIENT_ERROR_BACKOFF_MULTIPLIER",
        DEFAULT_POLLING_CONFIG.transientErrorBackoffMultiplier,
      ),
      maxBackoffMs: this.configService.get<number>(
        "POLLING_MAX_BACKOFF_MS",
        DEFAULT_POLLING_CONFIG.maxBackoffMs,
      ),
      initialBackoffMs: this.configService.get<number>(
        "POLLING_INITIAL_BACKOFF_MS",
        DEFAULT_POLLING_CONFIG.initialBackoffMs,
      ),
    };

    this.logger.log(
      `Polling config: min=${this.pollingConfig.minIntervalMs}ms, max=${this.pollingConfig.maxIntervalMs}ms, lagThreshold=${this.pollingConfig.lagThresholdLedgers} ledgers`,
    );
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
    this.pipeline?.apply(PipelineTransition.START);
    this.startIngestion();
  }

  async onModuleDestroy() {
    this.logger.log("Stopping Ledger Poller...");
    this.isRunning = false;
    this.pipeline?.apply(PipelineTransition.SHUTDOWN);
    this.stopIngestion();
    try {
      await this.chain;
      await this.flushRemainder();
    } catch (error) {
      this.logger.warn(
        `Error while flushing ingestion buffer on shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.pipeline?.apply(PipelineTransition.STOP);
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

  private async ingestRawEvent(rawEvent: Record<string, unknown>): Promise<void> {
    const ledger = Number(rawEvent.ledger);
    const ledgerHash = String(rawEvent.ledger_hash || rawEvent.ledgerHash || "");

    if (ledgerHash) {
      const reorgAt = await this.cursorManager.checkForReorg(ledger, ledgerHash);
      if (reorgAt !== null) {
        this.logger.error(`Reorg detected at ledger ${reorgAt} - rolling back`);
        this.metrics.incrementReorgDetected();
        this.pipeline?.apply(PipelineTransition.REORG_DETECTED);
        await this.reorgRollback.rollback(reorgAt);
        this.pipeline?.apply(PipelineTransition.ROLLBACK_COMPLETE);
        return;
      }
    }

    const cursor = await this.cursorManager.getCursor();
    if (cursor && ledger - cursor.lastLedger < this.safetyDepth) {
      this.logger.debug(
        `Skipping ledger ${ledger}: within safety depth (${this.safetyDepth})`,
      );
      return;
    }

    const rawSorobanEvent = {
      type: (rawEvent.type as string) || "contract",
      topics: (rawEvent.topic as string[]) || (rawEvent.topics as string[]) || [],
      value: (rawEvent.value as string) || "",
      contractId:
        (rawEvent.contract_id as string) ||
        (rawEvent.contractId as string) ||
        (rawEvent.address as string),
    };

    const parsed = this.eventParser.parse(rawSorobanEvent as never);
    if (!parsed) {
      // Unparseable event: model the parser-failure path and resume polling.
      this.pipeline?.apply(PipelineTransition.EVENTS_RECEIVED);
      this.pipeline?.apply(PipelineTransition.PARSE_FAILURE);
      this.pipeline?.apply(PipelineTransition.DLQ_ENQUEUED);
      return;
    }

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

    // Drive the success path for this batch: parsed events are dispatched and
    // the cursor advanced. Per-event handler failures are reported by the
    // dispatcher itself (HANDLER_FAILURE → DLQ_ENQUEUED).
    this.pipeline?.apply(PipelineTransition.EVENTS_RECEIVED);
    this.pipeline?.apply(PipelineTransition.PARSE_SUCCESS);

    try {
      const results = await this.dispatcher.dispatchBatch(
        batch.map((b) => ({ event: b.parsed, raw: b.raw })),
      );
      this.pipeline?.apply(PipelineTransition.DISPATCH_SUCCESS);

      const nextToken = (lastRaw.paging_token as string | undefined) || lastId;
      const ledger = Number(lastRaw.ledger);
      const ledgerHash = String(lastRaw.ledger_hash || lastRaw.ledgerHash || "");

      if (this.dryRun.enabled) {
        this.logger.log(
          `[DRY-RUN] Would save cursor: ledger=${ledger} token=${nextToken}`,
        );
        this.metrics.incrementEventsProcessed('batch', batch.length);
        for (const item of batch) {
          this.metrics.incrementEventsProcessed(item.parsed.type);
        }
        this.pipeline?.apply(PipelineTransition.CURSOR_UPDATED);
        return;
      }

      await this.cursorManager.saveCursor(ledger, ledgerHash, nextToken);

      for (const item of batch) {
        this.metrics.incrementEventsProcessed(item.parsed.type);
      }

      const failed = results.filter((result) => result.outcome === "failed");
      if (failed.length > 0) {
        this.logger.warn(
          `Processed batch ending ${lastId ?? "?"} with ${failed.length} failed event(s) sent to DLQ`,
        );
      }
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
    // Reset backoff level when switching to polling fallback
    this.backoffLevel = 0;
    void this.pollOnce();
  }

  private async pollOnce() {
    if (!this.isRunning) return;

    const startTime = Date.now();
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
        .limit(this.pollingConfig.maxBatchSize)
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

      // Fetch latest ledger to calculate lag
      try {
        const latestLedgers = await this.horizonServer.ledgers().order("desc").limit(1).call();
        const latestLedger = latestLedgers.records[0]?.sequence;
        if (latestLedger && cursor?.lastLedger) {
          this.currentLagLedgers = Math.max(0, latestLedger - cursor.lastLedger);
          this.metrics.setLagLedgers(this.currentLagLedgers);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch latest ledger for lag metric: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Reset backoff on successful poll
      this.backoffLevel = 0;

      // Calculate next interval based on lag and backoff
      const nextDelay = calculateNextInterval(
        this.pollingConfig,
        this.currentLagLedgers,
        this.backoffLevel,
      );

      this.logger.debug(
        `Next poll in ${nextDelay}ms (lag: ${this.currentLagLedgers} ledgers, backoff level: ${this.backoffLevel})`,
      );

      this.pollingTimeout = setTimeout(() => void this.pollOnce(), nextDelay);
    } catch (error) {
      this.logger.error(
        `Polling error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.metrics.incrementErrors(1);

      // Determine error type and apply appropriate backoff
      if (isRateLimitError(error)) {
        this.logger.warn(`Rate limit detected, increasing backoff`);
        this.backoffLevel = Math.min(
          this.backoffLevel + 1,
          Math.ceil(Math.log2(this.pollingConfig.maxBackoffMs / this.pollingConfig.initialBackoffMs)) + 1,
        );
      } else if (isTransientError(error)) {
        this.logger.warn(`Transient error detected, increasing backoff`);
        this.backoffLevel = Math.min(
          this.backoffLevel + 1,
          Math.ceil(Math.log2(this.pollingConfig.maxBackoffMs / this.pollingConfig.initialBackoffMs)) + 1,
        );
      }

      this.scheduleReconnection();
    } finally {
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metrics.recordPollDuration(durationSeconds);
    }
  }

  private scheduleReconnection() {
    if (!this.isRunning) return;
    this.stopIngestion();

    // Use adaptive polling interval for reconnection
    const delay = calculateNextInterval(
      this.pollingConfig,
      this.currentLagLedgers,
      this.backoffLevel,
    );

    this.logger.log(
      `Reconnecting in ${delay}ms (backoff level: ${this.backoffLevel})...`,
    );

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
