import { Injectable, Logger } from "@nestjs/common";
import { SseService } from "../services/sse.service";

@Injectable()
export class TicketProcessor {
  private readonly logger = new Logger(TicketProcessor.name);

  constructor(private readonly sseService: SseService) {}

  /**
   * Call this after the indexer persists a ticket_purchased event.
   * Broadcasts the updated ticket count to all SSE subscribers.
   */
  async handleTicketCountUpdated(raffleId: number, ticketsSold: number): Promise<void> {
    this.logger.log(
      `Broadcasting ticket count update for raffle ${raffleId}: ${ticketsSold} sold`,
    );
    this.sseService.emit(raffleId, ticketsSold);
  }
}
