import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { UserEntity } from '../database/entities/user.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { RaffleEntity } from '../database/entities/raffle.entity';

@Injectable()
export class UserProcessor {
  private readonly logger = new Logger(UserProcessor.name);

  constructor(private dataSource: DataSource, private cacheService: CacheService) {}

  /**
   * Called when a TicketPurchased event is indexed.
   * Invalidates the buyer's user profile cache and the raffle detail.
   */
  async handleTicketPurchased(
    raffleId: number,
    buyer: string,
    ledger: number,
    txHash: string,
    queryRunner?: QueryRunner,
  ) {
    this.logger.log(`Handling TicketPurchased for ${buyer} in raffle ${raffleId}`);
    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const startedTx = !queryRunner;
    if (!queryRunner) {
      await runner.connect();
      await runner.startTransaction();
    }
    try {
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          address: buyer,
          firstSeenLedger: ledger,
        })
        .orIgnore()
        .execute();

      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          firstSeenLedger: () => `LEAST(first_seen_ledger, ${ledger})`,
        })
        .where('address = :buyer', { buyer })
        .execute();

      const ticketCounts = await runner.manager
        .createQueryBuilder(TicketEntity, 't')
        .select('COUNT(*)', 'total')
        .addSelect('COUNT(DISTINCT t.raffle_id)', 'distinctRaffles')
        .where('t.owner = :buyer', { buyer })
        .getRawOne();

      const totalTickets = Number(ticketCounts?.total ?? 0);
      const distinctRaffles = Number(ticketCounts?.distinctRaffles ?? 0);

      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          totalTicketsBought: totalTickets,
          totalRafflesEntered: distinctRaffles,
        })
        .where('address = :buyer', { buyer })
        .execute();

      if (startedTx) {
        await runner.commitTransaction();
      }

      await this.cacheService.invalidateUserProfile(buyer);
      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
    } catch (e) {
      if (startedTx) {
        await runner.rollbackTransaction();
      }
      throw e;
    } finally {
      if (startedTx) {
        await runner.release();
      }
    }
  }

  /**
   * Called when a TicketRefunded event is indexed.
   * Invalidates the recipient's user profile cache and the raffle detail.
   */
  async handleTicketRefunded(address: string, raffleId: string) {
    this.logger.log(`Handling TicketRefunded for ${address} in raffle ${raffleId}`);

    await this.cacheService.invalidateUserProfile(address);
    await this.cacheService.invalidateRaffleDetail(raffleId);
  }

  async handleRaffleFinalized(
    raffleId: number,
    winner: string | null,
    prizeAmount: string,
    queryRunner?: QueryRunner,
  ) {
    if (!winner) return;
    this.logger.log(`Handling RaffleFinalized for ${raffleId} winner ${winner}`);
    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const startedTx = !queryRunner;
    if (!queryRunner) {
      await runner.connect();
      await runner.startTransaction();
    }
    try {
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          address: winner,
          firstSeenLedger: 0,
        })
        .orIgnore()
        .execute();

      const raw = await runner.query(
        `SELECT COUNT(*)::int AS wins, COALESCE(SUM(prize_amount::numeric), 0)::text AS total_prize
         FROM raffles
         WHERE winner = $1`,
        [winner],
      );
      const wins = Number(raw?.[0]?.wins ?? 0);
      const totalPrize = String(raw?.[0]?.total_prize ?? '0');

      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          totalRafflesWon: wins,
          totalPrizeXlm: totalPrize,
        })
        .where('address = :winner', { winner })
        .execute();

      if (startedTx) {
        await runner.commitTransaction();
      }

      await this.cacheService.invalidateUserProfile(winner);
      await this.cacheService.invalidateLeaderboard();
    } catch (e) {
      if (startedTx) {
        await runner.rollbackTransaction();
      }
      throw e;
    } finally {
      if (startedTx) {
        await runner.release();
      }
    }
  }

  async handleRaffleCreated(
    creator: string,
    createdLedger: number,
    queryRunner?: QueryRunner,
  ) {
    this.logger.log(`Handling RaffleCreated by ${creator}`);
    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const startedTx = !queryRunner;
    if (!queryRunner) {
      await runner.connect();
      await runner.startTransaction();
    }
    try {
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          address: creator,
          firstSeenLedger: createdLedger,
        })
        .orIgnore()
        .execute();

      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          firstSeenLedger: () => `LEAST(first_seen_ledger, ${createdLedger})`,
        })
        .where('address = :creator', { creator })
        .execute();

      if (startedTx) {
        await runner.commitTransaction();
      }
    } catch (e) {
      if (startedTx) {
        await runner.rollbackTransaction();
      }
      throw e;
    } finally {
      if (startedTx) {
        await runner.release();
      }
    }
  }
}
