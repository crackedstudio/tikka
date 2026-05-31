import { Injectable, Logger, Optional } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { DomainEvent } from "./event.types";
import { DeadLetterQueueService } from "./dead-letter-queue.service";
import { PipelineStateMachine, PipelineTransition } from "./pipeline-state";
import { DlqReason } from "../database/entities/dead-letter-event.entity";
import {
  CURRENT_SCHEMA_VERSION,
  isSupportedSchemaVersion,
  UnsupportedSchemaVersionError,
} from "./handlers/schema-version";

export type HandlerOutcome = "succeeded" | "failed" | "skipped";

export interface DispatchItem {
  event: DomainEvent;
  raw: Record<string, unknown>;
}

export interface HandlerExecutionResult {
  handlerName: string;
  eventId: string;
  eventType: string;
  outcome: HandlerOutcome;
  durationMs: number;
  error?: Error;
}

@Injectable()
export class IngestionDispatcherService {
  private readonly logger = new Logger(IngestionDispatcherService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly raffleProcessor: RaffleProcessor,
    private readonly ticketProcessor: TicketProcessor,
    private readonly adminProcessor: AdminProcessor,
    @Optional() private readonly deadLetterQueue?: DeadLetterQueueService,
    @Optional() private readonly pipeline?: PipelineStateMachine,
  ) {}

  async dispatch(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Promise<HandlerExecutionResult> {
    return this.executeIsolated({ event, raw });
  }

  async dispatchMany(
    items: Array<{ event: DomainEvent; rawEvent: Record<string, unknown> }>,
  ): Promise<HandlerExecutionResult[]> {
    return this.dispatchBatch(
      items.map((item) => ({ event: item.event, raw: item.rawEvent })),
    );
  }

  async dispatchBatch(items: DispatchItem[]): Promise<HandlerExecutionResult[]> {
    const results: HandlerExecutionResult[] = [];

    for (const item of items) {
      results.push(await this.executeIsolated(item));
    }

    return results;
  }

  private async executeIsolated(
    item: DispatchItem,
  ): Promise<HandlerExecutionResult> {
    const { event, raw } = item;
    const startedAt = Date.now();
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    const eventId = txHash || "unknown";
    const handlerName = this.getHandlerName(event);
    const schemaVersion = event.schemaVersion ?? CURRENT_SCHEMA_VERSION;

    // Reject events whose schema version this build cannot decode, instead of
    // letting a handler silently mis-parse them.
    if (!isSupportedSchemaVersion(schemaVersion)) {
      const error = new UnsupportedSchemaVersionError(schemaVersion, event.type);
      const result = this.logResult({
        handlerName,
        eventId,
        eventType: event.type,
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        error,
      });
      await this.deadLetter({
        handlerName,
        eventId,
        event,
        raw,
        ledger,
        txHash,
        schemaVersion,
        reason: DlqReason.SCHEMA_UNSUPPORTED,
        error,
        durationMs: result.durationMs,
      });
      return result;
    }

    try {
      const runner = await this.applyEvent(event, raw);
      if (runner) {
        await runner.commitTransaction();
        await runner.release();
      }

      return this.logResult({
        handlerName,
        eventId,
        eventType: event.type,
        outcome: this.eventNeedsDatabase(event) ? "succeeded" : "skipped",
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const result = this.logResult({
        handlerName,
        eventId,
        eventType: event.type,
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      await this.deadLetter({
        handlerName,
        eventId,
        event,
        raw,
        ledger,
        txHash,
        schemaVersion,
        reason: DlqReason.HANDLER_ERROR,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: result.durationMs,
      });

      return result;
    }
  }

  /**
   * Records a failed event in the dead-letter queue with its schema version and
   * failure reason, and advances the pipeline state machine accordingly.
   */
  private async deadLetter(params: {
    handlerName: string;
    eventId: string;
    event: DomainEvent;
    raw: Record<string, unknown>;
    ledger: number;
    txHash: string;
    schemaVersion: number;
    reason: DlqReason;
    error: Error;
    durationMs: number;
  }): Promise<void> {
    this.pipeline?.apply(PipelineTransition.HANDLER_FAILURE);

    await this.deadLetterQueue?.enqueue({
      handlerName: params.handlerName,
      eventId: params.eventId,
      eventType: params.event.type,
      ledger: Number.isFinite(params.ledger) ? params.ledger : null,
      txHash: params.txHash || null,
      schemaVersion: params.schemaVersion,
      reason: params.reason,
      errorMessage: params.error.message,
      errorStack: params.error.stack,
      durationMs: params.durationMs,
      event: params.event,
      rawEvent: params.raw,
      failedAt: new Date().toISOString(),
    });

    this.pipeline?.apply(PipelineTransition.DLQ_ENQUEUED);
  }

  private eventNeedsDatabase(event: DomainEvent): boolean {
    switch (event.type) {
      case "DrawTriggered":
      case "RandomnessRequested":
      case "RandomnessReceived":
        return false;
      default:
        return true;
    }
  }

  private async applyEvent(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Promise<QueryRunner | null> {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    const schemaVersion = event.schemaVersion ?? CURRENT_SCHEMA_VERSION;

    switch (event.type) {
      case "RaffleCreated":
        return this.raffleProcessor.handleRaffleCreated(
          event.raffle_id,
          event.creator,
          ledger,
          txHash,
          event.params,
          schemaVersion,
        );

      case "RaffleFinalized":
        return this.raffleProcessor.handleRaffleFinalized(
          event.raffle_id,
          event.winner,
          event.winning_ticket_id,
          event.prize_amount,
          ledger,
          txHash,
          schemaVersion,
        );

      case "RaffleCancelled":
        return this.raffleProcessor.handleRaffleCancelled(
          event.raffle_id,
          event.reason,
          ledger,
          txHash,
          schemaVersion,
        );

      case "TicketPurchased": {
        const runner = await this.startRunner();
        try {
          await this.ticketProcessor.handleTicketPurchased(
            event.raffle_id,
            event.buyer,
            event.ticket_ids,
            event.total_paid,
            ledger,
            txHash,
            runner,
          );
          return runner;
        } catch (error) {
          await runner.rollbackTransaction();
          await runner.release();
          throw error;
        }
      }

      case "TicketRefunded": {
        const runner = await this.startRunner();
        try {
          await this.ticketProcessor.handleTicketRefunded(
            event.raffle_id,
            event.ticket_id,
            event.recipient,
            event.amount,
            txHash,
            runner,
          );
          return runner;
        } catch (error) {
          await runner.rollbackTransaction();
          await runner.release();
          throw error;
        }
      }

      case "ContractPaused":
      case "ContractUnpaused":
      case "AdminTransferProposed":
      case "AdminTransferAccepted":
        return this.applyAdminEvent(event, raw);

      case "DrawTriggered":
        this.logger.log(
          `DrawTriggered for raffle ${event.raffle_id} at ledger ${event.ledger}`,
        );
        return null;

      case "RandomnessRequested":
        this.logger.log(
          `RandomnessRequested for raffle ${event.raffle_id}, request ID ${event.request_id}`,
        );
        return null;

      case "RandomnessReceived":
        this.logger.log(`RandomnessReceived for raffle ${event.raffle_id}`);
        return null;

      default:
        this.logger.warn(
          `No processor method found for event type: ${(event as DomainEvent).type}`,
        );
        return null;
    }
  }

  private async applyAdminEvent(
    event: Extract<
      DomainEvent,
      {
        type:
          | "ContractPaused"
          | "ContractUnpaused"
          | "AdminTransferProposed"
          | "AdminTransferAccepted";
      }
    >,
    raw: Record<string, unknown>,
  ): Promise<QueryRunner> {
    const runner = await this.startRunner();
    const ledger = Number(raw.ledger);
    const row = this.toRaffleEventRow(event, raw);

    try {
      if (row) {
        await runner.manager
          .createQueryBuilder()
          .insert()
          .into(RaffleEventEntity)
          .values(row as never)
          .orIgnore()
          .execute();
      }

      switch (event.type) {
        case "ContractPaused":
          await this.adminProcessor.handleContractPaused(event.admin, ledger, runner);
          break;
        case "ContractUnpaused":
          await this.adminProcessor.handleContractUnpaused(event.admin, ledger, runner);
          break;
        case "AdminTransferProposed":
          await this.adminProcessor.handleAdminTransferProposed(
            event.current_admin,
            event.proposed_admin,
            ledger,
            runner,
          );
          break;
        case "AdminTransferAccepted":
          await this.adminProcessor.handleAdminTransferAccepted(
            event.old_admin,
            event.new_admin,
            ledger,
            runner,
          );
          break;
      }

      return runner;
    } catch (error) {
      await runner.rollbackTransaction();
      await runner.release();
      throw error;
    }
  }

  private async startRunner(): Promise<QueryRunner> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    return runner;
  }

  private toRaffleEventRow(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Partial<RaffleEventEntity> | null {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    if (!txHash || Number.isNaN(ledger)) {
      return null;
    }

    switch (event.type) {
      case "ContractPaused":
        return {
          raffleId: 0,
          eventType: "ContractPaused",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "ContractUnpaused":
        return {
          raffleId: 0,
          eventType: "ContractUnpaused",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "AdminTransferProposed":
        return {
          raffleId: 0,
          eventType: "AdminTransferProposed",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: {
            current_admin: event.current_admin,
            proposed_admin: event.proposed_admin,
          },
        };
      case "AdminTransferAccepted":
        return {
          raffleId: 0,
          eventType: "AdminTransferAccepted",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: {
            old_admin: event.old_admin,
            new_admin: event.new_admin,
          },
        };
      default:
        return null;
    }
  }

  private getHandlerName(event: DomainEvent): string {
    switch (event.type) {
      case "RaffleCreated":
        return "RaffleProcessor.handleRaffleCreated";
      case "TicketPurchased":
        return "TicketProcessor.handleTicketPurchased";
      case "RaffleFinalized":
        return "RaffleProcessor.handleRaffleFinalized";
      case "RaffleCancelled":
        return "RaffleProcessor.handleRaffleCancelled";
      case "TicketRefunded":
        return "TicketProcessor.handleTicketRefunded";
      case "ContractPaused":
        return "AdminProcessor.handleContractPaused";
      case "ContractUnpaused":
        return "AdminProcessor.handleContractUnpaused";
      case "AdminTransferProposed":
        return "AdminProcessor.handleAdminTransferProposed";
      case "AdminTransferAccepted":
        return "AdminProcessor.handleAdminTransferAccepted";
      default:
        return `${event.type}Handler`;
    }
  }

  private logResult(result: HandlerExecutionResult): HandlerExecutionResult {
    const line = `handler=${result.handlerName} eventId=${result.eventId} outcome=${result.outcome} durationMs=${result.durationMs}`;

    if (result.outcome === "failed") {
      this.logger.error(line, result.error?.stack);
    } else {
      this.logger.log(line);
    }

    return result;
  }
}
