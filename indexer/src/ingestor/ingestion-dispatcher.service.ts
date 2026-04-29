import { Injectable, Logger, Optional } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { UserProcessor } from "../processors/user.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { DomainEvent } from "./event.types";
import { DlqService } from "./dlq.service";

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
    @Optional() private readonly dlqService?: DlqService,
  ) {}

  /**
   * Dispatches a parsed domain event to the appropriate processor.
   *
   * Returns the QueryRunner used for the event write, or null for log-only events.
   * The caller (LedgerPoller) is responsible for commit and release.
   * On error, the QueryRunner is released by the processor before re-throwing.
   *
   * @param event The parsed DomainEvent
   * @param rawEvent The original raw event from Horizon (containing ledger, txHash, etc.)
   */
  async dispatch(event: DomainEvent, rawEvent: any): Promise<QueryRunner | null> {
    const ledger = Number(rawEvent.ledger);
    const txHash = rawEvent.id || rawEvent.paging_token;

    this.logger.debug(`Dispatching event: ${event.type} from ledger ${ledger}`);

    try {
      switch (event.type) {
        case "RaffleCreated":
          return await this.raffleProcessor.handleRaffleCreated(
            event.raffle_id,
            event.creator,
            ledger,
          );

        case "TicketPurchased":
          return await this.ticketProcessor.handleTicketPurchased(
            event.raffle_id,
            event.buyer,
            event.ticket_ids,
            event.total_paid,
            ledger,
            txHash,
          );

        case "RaffleFinalized":
          return await this.raffleProcessor.handleRaffleFinalized(
            event.raffle_id,
            event.winner,
            event.prize_amount,
          );

        case "RaffleCancelled":
          return await this.raffleProcessor.handleRaffleCancelled(
            event.raffle_id,
            event.reason,
            ledger,
            txHash,
          );

        case "TicketRefunded":
          return await this.ticketProcessor.handleTicketRefunded(
            event.raffle_id,
            event.ticket_id,
            event.recipient,
            event.amount,
            txHash,
          );

        case "ContractPaused":
          return await this.adminProcessor.handleContractPaused(event.admin, ledger, txHash);

        case "ContractUnpaused":
          return await this.adminProcessor.handleContractUnpaused(event.admin, ledger, txHash);

        case "AdminTransferProposed":
          return await this.adminProcessor.handleAdminTransferProposed(
            event.current_admin,
            event.proposed_admin,
            ledger,
            txHash,
          );

        case "AdminTransferAccepted":
          return await this.adminProcessor.handleAdminTransferAccepted(
            event.old_admin,
            event.new_admin,
            ledger,
            txHash,
          );

        case "DrawTriggered":
          this.logger.log(`DrawTriggered for raffle ${event.raffle_id} at ledger ${event.ledger}`);
          return null;

        case "RandomnessRequested":
          this.logger.log(`RandomnessRequested for raffle ${event.raffle_id}, request ID ${event.request_id}`);
          return null;

        case "RandomnessReceived":
          this.logger.log(`RandomnessReceived for raffle ${event.raffle_id}`);
          return null;

        default:
          this.logger.warn(`No processor method found for event type: ${(event as any).type}`);
          return null;
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to dispatch event ${event.type} for tx ${txHash}: ${error.message}`,
        error.stack,
      );
      // Write to DLQ if available
      if (this.dlqService) {
        await this.dlqService.insert(event, rawEvent, error);
      }
      // QueryRunner already released by processor on error
      throw error;
    }
  }
}
