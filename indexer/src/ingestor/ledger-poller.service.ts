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
import { DomainEvent } from "./event.types";

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

  constructor(
    private configService: ConfigService,
    private cursorManager: CursorManagerService,
    private eventParser: EventParserV2Service,
    private dryRun: DryRunService,
    private dispatcher: IngestionDispatcherService,
    private metrics: MetricsService,
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

    const rawBatch = this.configService.get<string | number>("INDEXER_BATCH_SIZE", 100);
    const parsed = typeof rawBatch === "string" ? parseInt(rawBatch, 10) : rawBatch;
    this.batchSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
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

  private async ingestRawEvent(rawEvent: Record<string, unknown>): Promise<void> {
    const rawSorobanEvent = {
      type: (rawEvent.type as string) || "contract",
      topics: (rawEvent.topic as unknown[]) || (rawEvent.topics as unknown[]) || [],
      value: rawEvent.value || "",
      contractId:
        (rawEvent.contract_id as string) ||
        (rawEvent.contractId as string) ||
        (rawEvent.address as string),
    };

    const parsed = this.eventParser.parse(rawSorobanEvent as never);
    if (!parsed) {
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

    try {
      const queryRunner = await this.dispatcher.dispatchBatch(
        batch.map((b) => ({ event: b.parsed, raw: b.raw })),
      );

      const nextToken = (lastRaw.paging_token as string | undefined) || lastId;
      const ledger = Number(lastRaw.ledger);

      if (this.dryRun.enabled) {
        this.logger.log(
          `[DRY-RUN] Would save cursor: ledger=${String(lastRaw.ledger)} token=${nextToken}`,
        );
        if (queryRunner) {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
        }
        this.metrics.incrementEventsProcessed(batch.length);
        return;
      }

      await this.cursorManager.saveCursor(
        ledger,
        nextToken,
        queryRunner ?? undefined,
      );

      if (queryRunner) {
        await queryRunner.commitTransaction();
        await queryRunner.release();
      }

      for (const item of batch) {
        this.metrics.incrementEventsProcessed(item.parsed.type);
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

      // Update lag metric
      try {
        const latestLedgers = await this.horizonServer.ledgers().order("desc").limit(1).call();
        const latestLedger = latestLedgers.records[0]?.sequence;
        if (latestLedger && cursor?.lastLedger) {
          const lag = Math.max(0, latestLedger - cursor.lastLedger);
          this.metrics.setLagLedgers(lag);
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch latest ledger for lag metric: ${e.message}`);
      }

      // Reset retry attempt on any successful communication
      this.retryAttempt = 0;

      const nextDelay = records.length === 100 ? 500 : 5000;
      this.pollingTimeout = setTimeout(() => void this.pollOnce(), nextDelay);
    } catch (error) {
      this.logger.error(
        `Polling error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.metrics.incrementErrors(1);
      this.scheduleReconnection();
    } finally {
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metrics.recordPollDuration(durationSeconds);
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
