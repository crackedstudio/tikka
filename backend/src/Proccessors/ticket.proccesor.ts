import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Ticket } from '../entities/ticket.entity';
import { Raffle } from '../entities/raffle.entity';
import { TicketPurchasedEvent, TicketRefundedEvent } from '../types/events';

@Injectable()
export class TicketProcessor {
  private readonly logger = new Logger(TicketProcessor.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Raffle)
    private readonly raffleRepository: Repository<Raffle>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Process TicketPurchased event
   * - Insert ticket rows (one per ticket_id)
   * - Update raffle.tickets_sold count
   * - Idempotent by tx_hash
   */
  async processTicketPurchased(event: TicketPurchasedEvent): Promise<void> {
    const { tx_hash, raffle_id, ticket_ids, buyer, amount, timestamp } = event;

    // Check if already processed (idempotency)
    const existingTicket = await this.ticketRepository.findOne({
      where: { tx_hash },
    });

    if (existingTicket) {
      this.logger.log(`Ticket purchase already processed for tx: ${tx_hash}`);
      return;
    }

    // Use transaction to ensure consistency between ticket insert and raffle update
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const raffleRepo = manager.getRepository(Raffle);

      // Insert tickets (one row per ticket_id)
      const tickets = ticket_ids.map((ticketId) =>
        ticketRepo.create({
          ticket_id: ticketId,
          raffle_id,
          buyer,
          purchase_tx_hash: tx_hash,
          purchase_amount: amount,
          purchased_at: new Date(timestamp),
          refunded: false,
          // Composite unique constraint on (raffle_id, ticket_id) prevents duplicates
        }),
      );

      await ticketRepo.save(tickets);
      this.logger.log(`Inserted ${tickets.length} tickets for raffle ${raffle_id}`);

      // Update raffle tickets_sold count
      // Option 1: Increment counter
      await raffleRepo.increment(
        { raffle_id },
        'tickets_sold',
        ticket_ids.length,
      );

      // Option 2: Derive from count (alternative approach)
      // const soldCount = await ticketRepo.count({
      //   where: { raffle_id, refunded: false },
      // });
      // await raffleRepo.update({ raffle_id }, { tickets_sold: soldCount });
    });

    this.logger.log(`Processed ticket purchase for raffle ${raffle_id}, tx: ${tx_hash}`);
  }

  /**
   * Process TicketRefunded event
   * - Mark ticket as refunded (refund_tx_hash, refunded=true)
   * - Update raffle tickets_sold if needed
   * - Idempotent by refund_tx_hash
   */
  async processTicketRefunded(event: TicketRefundedEvent): Promise<void> {
    const { refund_tx_hash, raffle_id, ticket_ids, refund_amount, timestamp } = event;

    // Check if already processed
    const existingRefund = await this.ticketRepository.findOne({
      where: { refund_tx_hash },
    });

    if (existingRefund) {
      this.logger.log(`Ticket refund already processed for tx: ${refund_tx_hash}`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(Ticket);
      const raffleRepo = manager.getRepository(Raffle);

      // Update each ticket as refunded
      for (const ticketId of ticket_ids) {
        const ticket = await ticketRepo.findOne({
          where: { raffle_id, ticket_id: ticketId },
        });

        if (!ticket) {
          this.logger.warn(`Ticket ${ticketId} not found for raffle ${raffle_id}`);
          continue;
        }

        if (ticket.refunded) {
          this.logger.log(`Ticket ${ticketId} already marked as refunded`);
          continue;
        }

        await ticketRepo.update(
          { raffle_id, ticket_id: ticketId },
          {
            refunded: true,
            refund_tx_hash,
            refunded_at: new Date(timestamp),
            refund_amount,
          },
        );
      }

      // Update raffle tickets_sold count (decrement)
      await raffleRepo.decrement(
        { raffle_id },
        'tickets_sold',
        ticket_ids.length,
      );

      // Alternative: Derive from count
      // const soldCount = await ticketRepo.count({
      //   where: { raffle_id, refunded: false },
      // });
      // await raffleRepo.update({ raffle_id }, { tickets_sold: soldCount });
    });

    this.logger.log(`Processed ticket refund for raffle ${raffle_id}, tx: ${refund_tx_hash}`);
  }
}