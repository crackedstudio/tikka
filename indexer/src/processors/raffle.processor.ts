import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { DataSource, QueryRunner } from "typeorm";
import { UserProcessor } from "./user.processor";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { RaffleEntity, RaffleStatus } from "../database/entities/raffle.entity";
import { WebhookService, WebhookPayload } from "../webhooks/webhook.service";

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
   * Invalidates active raffles list cache.
   */
  async handleRaffleCreated(
    raffleId: number,
    creator?: string,
    ledger?: number,
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleCreated for ${raffleId}`);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      if (creator && typeof ledger === "number") {
        await this.userProcessor.handleRaffleCreated(creator, ledger, runner);
      }

      // Invalidate caches
      await this.cacheService.invalidateActiveRaffles();

      // Dispatch webhook after successful DB write
      if (creator && typeof ledger === "number") {
        await this.webhookService.dispatchEvent({
          eventType: "RaffleCreated",
          raffleId,
          timestamp: new Date(),
          data: { creator, ledger },
        });
      }

      return runner;
    } catch (e) {
      await runner.rollbackTransaction();
      await runner.release();
      throw e;
    }
  }

  /**
   * Called when a RaffleFinalized event is indexed.
   * Invalidates raffle detail and leaderboard.
   */
  async handleRaffleFinalized(
    raffleId: number,
    winner?: string,
    prizeAmount?: string,
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleFinalized for ${raffleId}`);
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      if (winner) {
        await this.userProcessor.handleRaffleFinalized(
          raffleId,
          winner,
          prizeAmount ?? "0",
          runner,
        );
      }

      // Invalidate caches
      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateLeaderboard();

      // Dispatch webhook after successful DB write
      if (winner) {
        await this.webhookService.dispatchEvent({
          eventType: "RaffleFinalized",
          raffleId,
          timestamp: new Date(),
          data: { winner, prizeAmount },
        });
      }

      return runner;
    } catch (e) {
      await runner.rollbackTransaction();
      await runner.release();
      throw e;
    }
  }

  async handleRaffleCancelled(
    raffleId: number,
    reason: string,
    ledger: number,
    txHash: string,
  ): Promise<QueryRunner> {
    this.logger.log(`Handling RaffleCancelled for ${raffleId}`);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId,
          eventType: "RaffleCancelled",
          ledger,
          txHash,
          payloadJson: {
            raffle_id: raffleId,
            reason,
          },
        })
        .orIgnore()
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update(RaffleEntity)
        .set({
          status: RaffleStatus.CANCELLED,
          finalizedLedger: ledger,
        })
        .where("id = :raffleId", { raffleId })
        .execute();

      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
      await this.cacheService.invalidateActiveRaffles();

      return queryRunner;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.logger.error(
        `Error processing RaffleCancelled for txHash ${txHash}`,
        error as any,
      );
      throw error;
    }
  }
}
