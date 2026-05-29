import { Injectable, Logger } from "@nestjs/common";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { UserProcessor } from "../processors/user.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { DomainEvent } from "./event.types";
import { DeadLetterQueueService } from "./dead-letter-queue.service";

export type HandlerOutcome = "succeeded" | "failed" | "skipped";

export interface HandlerExecutionResult {
  handlerName: string;
  eventId: string;
  eventType: string;
  outcome: HandlerOutcome;
  durationMs: number;
  error?: Error;
}

/**
 * IngestionDispatcherService
 * 
 * Responsible for orchestrating the processing of parsed DomainEvents.
 * It maps event types to the appropriate methods in the various processors.
 */
@Injectable()
export class IngestionDispatcherService {
  private readonly logger = new Logger(IngestionDispatcherService.name);

  constructor(
    private readonly raffleProcessor: RaffleProcessor,
    private readonly ticketProcessor: TicketProcessor,
    private readonly userProcessor: UserProcessor,
    private readonly adminProcessor: AdminProcessor,
    private readonly deadLetterQueue: DeadLetterQueueService,
  ) {}

  /**
   * Dispatches a parsed domain event to the appropriate processor.
   * 
   * @param event The parsed DomainEvent
   * @param rawEvent The original raw event from Horizon (containing ledger, txHash, etc.)
   */
  async dispatch(
    event: DomainEvent,
    rawEvent: any,
  ): Promise<HandlerExecutionResult> {
    const ledger = Number(rawEvent.ledger);
    const txHash = rawEvent.id || rawEvent.paging_token;
    const eventId = String(rawEvent.id || rawEvent.paging_token || txHash || "unknown");
    const handlerName = this.getHandlerName(event);
    const startedAt = Date.now();

    this.logger.debug(`Dispatching event: ${event.type} from ledger ${ledger}`);

    try {
      switch (event.type) {
        case "RaffleCreated":
          await this.raffleProcessor.handleRaffleCreated(
            event.raffle_id,
            event.creator,
            ledger,
          );
          break;

        case "TicketPurchased":
          await this.ticketProcessor.handleTicketPurchased(
            event.raffle_id,
            event.buyer,
            event.ticket_ids,
            event.total_paid,
            ledger,
            txHash,
          );
          break;

        case "RaffleFinalized":
          await this.raffleProcessor.handleRaffleFinalized(
            event.raffle_id,
            event.winner,
            event.prize_amount,
          );
          break;

        case "RaffleCancelled":
          await this.raffleProcessor.handleRaffleCancelled(
            event.raffle_id,
            event.reason,
            ledger,
            txHash,
          );
          break;

        case "TicketRefunded":
          await this.ticketProcessor.handleTicketRefunded(
            event.raffle_id,
            event.ticket_id,
            event.recipient,
            event.amount,
            txHash,
          );
          break;

        case "ContractPaused":
          await this.adminProcessor.handleContractPaused(event.admin, ledger, txHash);
          break;

        case "ContractUnpaused":
          await this.adminProcessor.handleContractUnpaused(event.admin, ledger, txHash);
          break;

        case "AdminTransferProposed":
          await this.adminProcessor.handleAdminTransferProposed(
            event.current_admin,
            event.proposed_admin,
            ledger,
            txHash,
          );
          break;

        case "AdminTransferAccepted":
          await this.adminProcessor.handleAdminTransferAccepted(
            event.old_admin,
            event.new_admin,
            ledger,
            txHash,
          );
          break;

        case "DrawTriggered":
          this.logger.log(`DrawTriggered for raffle ${event.raffle_id} at ledger ${event.ledger}`);
          // Currently, this might just be logged or used for internal state tracking
          break;

        case "RandomnessRequested":
          this.logger.log(`RandomnessRequested for raffle ${event.raffle_id}, request ID ${event.request_id}`);
          break;

        case "RandomnessReceived":
          this.logger.log(`RandomnessReceived for raffle ${event.raffle_id}`);
          break;

        default:
          this.logger.warn(`No processor method found for event type: ${(event as any).type}`);
          return this.logResult({
            handlerName,
            eventId,
            eventType: (event as any).type,
            outcome: "skipped",
            durationMs: Date.now() - startedAt,
          });
      }

      return this.logResult({
        handlerName,
        eventId,
        eventType: event.type,
        outcome: "succeeded",
        durationMs: Date.now() - startedAt,
      });
    } catch (error: any) {
      const result = this.logResult({
        handlerName,
        eventId,
        eventType: event.type,
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        error,
      });

      await this.deadLetterQueue.enqueue({
        handlerName,
        eventId,
        eventType: event.type,
        ledger: Number.isFinite(ledger) ? ledger : null,
        txHash: txHash ? String(txHash) : null,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        durationMs: result.durationMs,
        event,
        rawEvent,
        failedAt: new Date().toISOString(),
      });

      return result;
    }
  }

  async dispatchMany(
    items: Array<{ event: DomainEvent; rawEvent: any }>,
  ): Promise<HandlerExecutionResult[]> {
    const results: HandlerExecutionResult[] = [];

    for (const item of items) {
      results.push(await this.dispatch(item.event, item.rawEvent));
    }

    return results;
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
