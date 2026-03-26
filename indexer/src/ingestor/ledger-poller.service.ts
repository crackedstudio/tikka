import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { rpc } from "@stellar/stellar-sdk";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";

@Injectable()
export class LedgerPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerPollerService.name);
  private rpcServer: rpc.Server;
  private contractId: string;
  private isPolling = false;
  private timeoutId?: NodeJS.Timeout;

  // Polling settings
  private readonly POLL_INTERVAL_MS = 3000;
  private readonly MAX_EVENTS_PER_REQ = 100;
  private readonly RETRY_BACKOFF_MS = 5000;

  constructor(
    private configService: ConfigService,
    private cursorManager: CursorManagerService,
    private eventParser: EventParserService,
  ) {
    const rpcUrl =
      this.configService.get<string>("SOROBAN_RPC_URL") ||
      "https://soroban-testnet.stellar.org";
    this.rpcServer = new rpc.Server(rpcUrl);

    // Provide a default contract ID format for testing if not set
    this.contractId =
      this.configService.get<string>("TIKKA_CONTRACT_ID") ||
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEWBEIFGDXY7CZZPNOYWVNNNEM5F2D";
  }

  async onModuleInit() {
    this.logger.log(`Starting Horizon poller for contract: ${this.contractId}`);
    this.isPolling = true;
    this.startPollingLoop();
  }

  onModuleDestroy() {
    this.logger.log("Stopping Horizon poller...");
    this.isPolling = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  private async startPollingLoop() {
    while (this.isPolling) {
      try {
        await this.pollOnce();

        // Success: wait standard interval before polling again
        await this.sleep(this.POLL_INTERVAL_MS);
      } catch (error) {
        this.logger.error(
          `Error polling events: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Failure: backoff before retrying
        await this.sleep(this.RETRY_BACKOFF_MS);
      }
    }
  }

  private async pollOnce() {
    // 1. Get the starting cursor (last known ledger)
    const cursor = await this.cursorManager.getCursor();
    const startLedger = cursor ? cursor.lastLedger + 1 : undefined;

    // 2. Build the request parameters
    const request: any = {
      filters: [
        {
          type: "contract",
          contractIds: [this.contractId],
        },
      ],
      limit: this.MAX_EVENTS_PER_REQ,
    };

    if (cursor?.lastPagingToken) {
      request.cursor = cursor.lastPagingToken;
    } else {
      request.startLedger = startLedger;
    }

    // 3. Fetch events from RPC
    this.logger.debug(`Fetching events from ledger ${startLedger ?? "latest"}`);
    const response = await this.rpcServer.getEvents(request);

    if (!response.events || response.events.length === 0) {
      return; // No new events
    }

    this.logger.log(`Received ${response.events.length} events from Horizon`);

    let highestLedgerProcessed = cursor?.lastLedger || 0;
    let lastPagingToken = cursor?.lastPagingToken;

    // 4. Process each event
    for (const rawEvent of response.events) {
      const parsedEvent = this.eventParser.parse({
        type: rawEvent.type,
        topics: rawEvent.topic.map((t) => t.toXDR("base64")),
        value: rawEvent.value.toXDR("base64"),
      });

      if (parsedEvent) {
        this.logger.log(
          `Parsed DomainEvent: [${parsedEvent.type}] from ledger ${rawEvent.ledger}`,
        );

        // NOTE: In the future, this is where we'd dispatch to processors
        // (e.g. RaffleProcessor, TicketProcessor) to persist to PostgreSQL
      }

      // Track the highest ledger we successfully processed in this batch
      highestLedgerProcessed = Math.max(
        highestLedgerProcessed,
        rawEvent.ledger,
      );
      lastPagingToken = (rawEvent as any).pagingToken || lastPagingToken;
    }

    // 5. Save the updated cursor after the batch is processed successfully
    if (response.events.length > 0) {
      await this.cursorManager.saveCursor(
        highestLedgerProcessed,
        lastPagingToken,
      );
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => {
      this.timeoutId = setTimeout(resolve, ms);
    });
  }
}
