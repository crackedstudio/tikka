import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { DataSource, QueryRunner } from "typeorm";
import { UserProcessor } from "./user.processor";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { RaffleEntity, RaffleStatus } from "../database/entities/raffle.entity";
import { WebhookService } from "../webhooks/webhook.service";

@Injectable()
export class RaffleProcessor {
  private readonly logger = new Logger(RaffleProcessor.name);

  constructor(
    private dataSource: DataSource,
    private cacheService: CacheService,
    private userProcessor: UserProcessor,
    private webhookService: WebhookService,
  ) {}

  /**
   * Called when a RaffleCreated event is indexed.
   *
   * Upserts the raffle row with all params and status OPEN.
   * Idempotent: the insert uses orIgnore() keyed on raffle_id, so replaying
   * the same event is a no-op. The raffle_events audit row is keyed on txHash.
   */
  async handleRaffleCreated(
    raffleId: number,
    creator: string,
    ledger: number,
    txHash: string,
    params: {
      ticket_price: string;
      max_tickets: number;
      end_time: number;
      asset: string;
      metadata_cid: string;
      allow_multiple: boolean;
    },
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleCreated for raffle ${raffleId} (tx ${txHash})`);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // 1. Upsert raffle row — idempotent via orIgnore on PK
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEntity)
        .values({
          id: raffleId,
          creator,
          status: RaffleStatus.OPEN,
          ticketPrice: params.ticket_price,
          asset: params.asset,
          maxTickets: params.max_tickets,
          endTime: params.end_time.toString(),
          metadataCid: params.metadata_cid || null,
          createdLedger: ledger,
          winner: null,
          winningTicketId: null,
          prizeAmount: null,
          finalizedLedger: null,
        })
        .orIgnore()
        .execute();

      // 2. Audit event — idempotent via unique constraint on txHash
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId,
          eventType: "RaffleCreated",
          ledger,
          txHash,
          payloadJson: { raffle_id: raffleId, creator, params },
        })
        .orIgnore()
        .execute();

      // 3. Ensure creator has a user row
      await this.userProcessor.handleRaffleCreated(creator, ledger, runner);

      await this.cacheService.invalidateActiveRaffles();
      await this.cacheService.invalidatePlatformStats();

      await this.webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId,
        timestamp: new Date(),
        data: { creator, ledger },
      });

      return runner;
    } catch (e) {
      await runner.rollbackTransaction();
      await runner.release();
      this.logger.error(`Error processing RaffleCreated for raffle ${raffleId} (tx ${txHash})`, e as any);
      throw e;
    }
  }

  /**
   * Called when a RaffleFinalized event is indexed.
   *
   * Updates the raffle row: winner, winning_ticket_id, prize_amount, status → FINALIZED.
   * Idempotent: the raffle_events audit row is keyed on txHash; the raffle UPDATE is
   * conditional on the row not already being FINALIZED.
   */
  async handleRaffleFinalized(
    raffleId: number,
    winner: string,
    winningTicketId: number,
    prizeAmount: string,
    ledger: number,
    txHash: string,
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleFinalized for raffle ${raffleId}, winner ${winner} (tx ${txHash})`);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // 1. Update raffle row — conditional so replays are no-ops
      await runner.manager
        .createQueryBuilder()
        .update(RaffleEntity)
        .set({
          status: RaffleStatus.FINALIZED,
          winner,
          winningTicketId,
          prizeAmount,
          finalizedLedger: ledger,
        })
        .where("id = :raffleId AND status != :finalized", {
          raffleId,
          finalized: RaffleStatus.FINALIZED,
        })
        .execute();

      // 2. Audit event — idempotent via unique constraint on txHash
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId,
          eventType: "RaffleFinalized",
          ledger,
          txHash,
          payloadJson: { raffle_id: raffleId, winner, winning_ticket_id: winningTicketId, prize_amount: prizeAmount },
        })
        .orIgnore()
        .execute();

      // 3. Update winner stats
      await this.userProcessor.handleRaffleFinalized(raffleId, winner, prizeAmount, runner);

      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateLeaderboard();
      await this.cacheService.invalidatePlatformStats();

      await this.webhookService.dispatchEvent({
        eventType: "RaffleFinalized",
        raffleId,
        timestamp: new Date(),
        data: { winner, winningTicketId, prizeAmount },
      });

      return runner;
    } catch (e) {
      await runner.rollbackTransaction();
      await runner.release();
      this.logger.error(`Error processing RaffleFinalized for raffle ${raffleId} (tx ${txHash})`, e as any);
      throw e;
    }
  }

  /**
   * Called when a RaffleCancelled event is indexed.
   *
   * Updates raffle status to CANCELLED.
   * Idempotent: the raffle_events audit row is keyed on txHash; the raffle UPDATE
   * is conditional on the row not already being CANCELLED.
   */
  async handleRaffleCancelled(
    raffleId: number,
    reason: string,
    ledger: number,
    txHash: string,
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleCancelled for raffle ${raffleId} (tx ${txHash})`);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // 1. Update raffle row — conditional so replays are no-ops
      await runner.manager
        .createQueryBuilder()
        .update(RaffleEntity)
        .set({
          status: RaffleStatus.CANCELLED,
          finalizedLedger: ledger,
        })
        .where("id = :raffleId AND status != :cancelled", {
          raffleId,
          cancelled: RaffleStatus.CANCELLED,
        })
        .execute();

      // 2. Audit event — idempotent via unique constraint on txHash
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId,
          eventType: "RaffleCancelled",
          ledger,
          txHash,
          payloadJson: { raffle_id: raffleId, reason },
        })
        .orIgnore()
        .execute();

      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateActiveRaffles();

      return runner;
    } catch (e) {
      await runner.rollbackTransaction();
      await runner.release();
      this.logger.error(`Error processing RaffleCancelled for raffle ${raffleId} (tx ${txHash})`, e as any);
      throw e;
    }
  }
}
