import { Injectable, Logger } from "@nestjs/common";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { UserProcessor } from "../processors/user.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { DomainEvent } from "./event.types";

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
  ) {}

  /**
   * Dispatches a parsed domain event to the appropriate processor.
   * 
   * @param event The parsed DomainEvent
   * @param rawEvent The original raw event from Horizon (containing ledger, txHash, etc.)
   */
  async dispatch(event: DomainEvent, rawEvent: any): Promise<void> {
    const ledger = Number(rawEvent.ledger);
    const txHash = rawEvent.id || rawEvent.paging_token;

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
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to dispatch event ${event.type} for tx ${txHash}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to allow LedgerPoller to handle retry/backoff
    }
  }
}
