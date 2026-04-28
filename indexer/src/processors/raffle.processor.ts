import { Injectable, Logger } from "@nestjs/common";
import { QueryRunner } from "typeorm";
import { CacheService } from "../cache/cache.service";
import { UserProcessor } from "./user.processor";
import { RaffleEntity, RaffleStatus } from "../database/entities/raffle.entity";
import { WebhookService, WebhookPayload } from "../webhooks/webhook.service";

@Injectable()
export class RaffleProcessor {
  private readonly logger = new Logger(RaffleProcessor.name);

  constructor(
    private cacheService: CacheService,
    private userProcessor: UserProcessor,
    private webhookService: WebhookService,
  ) {}

  /**
   * Called when a RaffleCreated event is indexed.
   * Runs inside the caller's transaction (shared QueryRunner).
   */
  async handleRaffleCreated(
    raffleId: number,
    creator: string | undefined,
    ledger: number | undefined,
    runner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`Handling RaffleCreated for ${raffleId}`);

    if (creator && typeof ledger === "number") {
      await this.userProcessor.handleRaffleCreated(creator, ledger, runner);
    }

    await this.cacheService.invalidateActiveRaffles();

    if (creator && typeof ledger === "number") {
      await this.webhookService.dispatchEvent({
        eventType: "RaffleCreated",
        raffleId,
        timestamp: new Date(),
        data: { creator, ledger },
      } as WebhookPayload);
    }
  }

  /**
   * Called when a RaffleFinalized event is indexed.
   */
  async handleRaffleFinalized(
    raffleId: number,
    winner: string | undefined,
    prizeAmount: string | undefined,
    runner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`Handling RaffleFinalized for ${raffleId}`);

    if (winner) {
      await this.userProcessor.handleRaffleFinalized(
        raffleId,
        winner,
        prizeAmount ?? "0",
        runner,
      );
    }

    await this.cacheService.invalidateRaffleDetail(raffleId.toString());
    await this.cacheService.invalidateLeaderboard();

    if (winner) {
      await this.webhookService.dispatchEvent({
        eventType: "RaffleFinalized",
        raffleId,
        timestamp: new Date(),
        data: { winner, prizeAmount },
      } as WebhookPayload);
    }
  }

  /**
   * RaffleCancelled — raffle_events row is bulk-inserted by IngestionDispatcherService.
   */
  async handleRaffleCancelled(
    raffleId: number,
    reason: string,
    ledger: number,
    _txHash: string,
    runner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`Handling RaffleCancelled for ${raffleId}`);

    await runner.manager
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
  }
}
