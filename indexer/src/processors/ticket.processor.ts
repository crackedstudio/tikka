import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { TicketEntity } from "../database/entities/ticket.entity";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { CacheService } from "../cache/cache.service";
import { UserProcessor } from "./user.processor";

@Injectable()
export class TicketProcessor {
  private readonly logger = new Logger(TicketProcessor.name);

  constructor(
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
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(
      `Handling TicketPurchased for raffle ${raffleId} by ${buyer}`,
    );

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
        .orIgnore()
        .execute();
    }

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
      ticketIds.length,
      ledger,
      txHash,
      queryRunner,
    );

    await this.cacheService.invalidateRaffleDetail(raffleId.toString());
    await this.cacheService.invalidateUserProfile(buyer);
  }

  /**
   * Called when a TicketRefunded event is indexed.
   */
  async handleTicketRefunded(
    raffleId: number,
    ticketId: number,
    recipient: string,
    amount: string,
    txHash: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(
      `Handling TicketRefunded for raffle ${raffleId}, ticket ${ticketId}`,
    );

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

    await this.userProcessor.handleTicketRefunded(
      recipient,
      raffleId.toString(),
    );

    await this.cacheService.invalidateRaffleDetail(raffleId.toString());
    await this.cacheService.invalidateUserProfile(recipient);
  }
}
