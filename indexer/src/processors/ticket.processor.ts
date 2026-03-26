import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { TicketEntity } from "../database/entities/ticket.entity";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { CacheService } from "../cache/cache.service";
import { UserProcessor } from "./user.processor";

@Injectable()
export class TicketProcessor {
  private readonly logger = new Logger(TicketProcessor.name);

  constructor(
    private dataSource: DataSource,
    private cacheService: CacheService,
    private userProcessor: UserProcessor,
  ) {}

  /**
   * Called when a TicketPurchased event is indexed.
   * Inserts tickets idempotently and updates the raffle's ticketsSold count.
   */
  async handleTicketPurchased(
    raffleId: number,
    buyer: string,
    ticketIds: number[],
    totalCost: string,
    ledger: number,
    txHash: string,
  ) {
    this.logger.log(
      `Handling TicketPurchased for raffle ${raffleId} by ${buyer}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Insert tickets idempotently
      for (const ticketId of ticketIds) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(TicketEntity)
          .values({
            id: ticketId,
            raffleId,
            owner: buyer,
            purchasedAtLedger: ledger,
            purchaseTxHash: txHash,
            refunded: false,
          })
          .orIgnore() // Ignore if purchaseTxHash or id already exists
          .execute();
      }

      // 2. Update the raffle's ticketsSold count atomically
      // By using an atomic increment, we avoid race conditions if multiple purchases happen at once
      const ticketsCount = ticketIds.length;
      await queryRunner.manager
        .createQueryBuilder()
        .update(RaffleEntity)
        .set({
          ticketsSold: () => `tickets_sold + ${ticketsCount}`,
        })
        .where("id = :raffleId", { raffleId })
        .execute();

      await this.userProcessor.handleTicketPurchased(
        raffleId,
        buyer,
        ledger,
        txHash,
        queryRunner,
      );

      await queryRunner.commitTransaction();

      // Invalidate relevant caches
      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateUserProfile(buyer);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error processing TicketPurchased for txHash ${txHash}`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Called when a TicketRefunded event is indexed.
   * Marks a ticket as refunded.
   */
  async handleTicketRefunded(
    raffleId: number,
    ticketId: number,
    recipient: string,
    amount: string,
    txHash: string,
  ) {
    this.logger.log(
      `Handling TicketRefunded for raffle ${raffleId}, ticket ${ticketId}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Update the ticket
      await queryRunner.manager
        .createQueryBuilder()
        .update(TicketEntity)
        .set({
          refunded: true,
          refundTxHash: txHash,
        })
        .where("id = :ticketId AND raffle_id = :raffleId", {
          ticketId,
          raffleId,
        })
        .execute();

      // Note: We might want to decrement `ticketsSold` depending on business logic,
      // but usually refund means the raffle was cancelled, so `ticketsSold` doesn't matter much.
      // If we do want to decrement, we can add it here.

      await queryRunner.commitTransaction();

      // Invalidate caches
      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateUserProfile(recipient);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error processing TicketRefunded for txHash ${txHash}`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
