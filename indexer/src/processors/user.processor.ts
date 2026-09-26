import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { normalizeStellarAddress } from '@tikka/types';
import { CacheService } from '../cache/cache.service';
import { UserEntity } from '../database/entities/user.entity';

@Injectable()
export class UserProcessor {
  private readonly logger = new Logger(UserProcessor.name);

  constructor(private dataSource: DataSource, private cacheService: CacheService) {}

  /**
   * Reduce an address taken from a decoded event to the canonical strkey form
   * used as the `users` primary key.
   *
   * The backend reads the same rows through the same helper, so the two sides
   * cannot disagree about which row an account owns. Without this, a variant
   * spelling produces a second row under a second primary key and the account's
   * raffle history fragments across both.
   *
   * A value that cannot be canonicalised is stored verbatim after a warning
   * rather than rejected. The contract emits canonical strkeys, so this branch is
   * a data-integrity signal, and dropping the whole event over one malformed
   * field would lose ledger state that a later reconciliation could not recover.
   */
  private canonicalAddress(address: string, field: string): string {
    const canonical = normalizeStellarAddress(address);
    if (canonical) return canonical;

    this.logger.warn(
      `UserProcessor: ${field} is not a canonical Stellar address — storing it verbatim`,
    );
    return address;
  }

  /**
   * Called when a TicketPurchased event is indexed.
   *
   * Upserts the buyer row and atomically increments:
   *   - total_tickets_bought  by the number of tickets in this purchase
   *   - total_raffles_entered by 1 (only when this is the buyer's first ticket in this raffle)
   *
   * Idempotent: skips the update if last_tx_hash already equals txHash.
   * Runs inside the caller's QueryRunner when provided (ticket.processor shares its tx).
   */
  async handleTicketPurchased(
    raffleId: number,
    rawBuyer: string,
    ticketCount: number,
    ledger: number,
    txHash: string,
    queryRunner?: QueryRunner,
  ) {
    const buyer = this.canonicalAddress(rawBuyer, 'buyer');
    this.logger.log(`Handling TicketPurchased for ${buyer} in raffle ${raffleId}`);
    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const ownTx = !queryRunner;
    if (ownTx) {
      await runner.connect();
      await runner.startTransaction();
    }
    try {
      // 1. Ensure the user row exists
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          address: buyer,
          firstSeenLedger: ledger,
          lastTxHash: null,
        })
        .orIgnore()
        .execute();

      // 2. Idempotency check — skip if this tx was already applied
      const existing = await runner.manager.findOne(UserEntity, {
        where: { address: buyer },
        select: { lastTxHash: true, firstSeenLedger: true },
      });
      if (existing?.lastTxHash === txHash) {
        this.logger.debug(`TicketPurchased ${txHash} already applied for ${buyer}, skipping`);
        if (ownTx) await runner.commitTransaction();
        return;
      }

      // 3. Determine whether this is the buyer's first ticket in this raffle
      //    (within the same tx so the count is consistent)
      const priorTicketInRaffle = await runner.query(
        `SELECT 1 FROM tickets WHERE owner = $1 AND raffle_id = $2 AND purchase_tx_hash != $3 LIMIT 1`,
        [buyer, raffleId, txHash],
      );
      const isFirstEntryInRaffle = priorTicketInRaffle.length === 0;

      // 4. Atomic increments + update first_seen_ledger + stamp last_tx_hash
      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          totalTicketsBought: () => `total_tickets_bought + ${ticketCount}`,
          totalRafflesEntered: () =>
            isFirstEntryInRaffle
              ? `total_raffles_entered + 1`
              : `total_raffles_entered`,
          firstSeenLedger: () => `LEAST(first_seen_ledger, ${ledger})`,
          lastTxHash: txHash,
        })
        .where('address = :buyer', { buyer })
        .execute();

      if (ownTx) await runner.commitTransaction();

      await this.cacheService.invalidateUserProfile(buyer);
      await this.cacheService.invalidateRaffleDetail(raffleId.toString());
    } catch (e) {
      if (ownTx) await runner.rollbackTransaction();
      throw e;
    } finally {
      if (ownTx) await runner.release();
    }
  }

  /**
   * Called when a TicketRefunded event is indexed.
   * Invalidates the recipient's user profile cache and the raffle detail.
   */
  async handleTicketRefunded(address: string, raffleId: string) {
    const recipient = this.canonicalAddress(address, 'recipient');
    this.logger.log(`Handling TicketRefunded for ${recipient} in raffle ${raffleId}`);

    await this.cacheService.invalidateUserProfile(recipient);
    await this.cacheService.invalidateRaffleDetail(raffleId);
  }

  /**
   * Called when a RaffleFinalized event is indexed.
   *
   * Upserts the winner row and atomically increments:
   *   - total_raffles_won by 1
   *   - total_prize_xlm   by prizeAmount (bigint string addition via PostgreSQL numeric cast)
   *
   * Idempotent: keyed by a synthetic tx_hash derived from raffleId so a replay
   * of the same finalization is a no-op.
   * Runs inside the caller's QueryRunner when provided (raffle.processor shares its tx).
   */
  async handleRaffleFinalized(
    raffleId: number,
    rawWinner: string | null,
    prizeAmount: string,
    queryRunner?: QueryRunner,
  ) {
    if (!rawWinner) return;
    const winner = this.canonicalAddress(rawWinner, 'winner');
    this.logger.log(`Handling RaffleFinalized for raffle ${raffleId}, winner ${winner}`);

    // Synthetic idempotency key — one finalization per raffle
    const txHash = `finalized:${raffleId}`;

    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const ownTx = !queryRunner;
    if (ownTx) {
      await runner.connect();
      await runner.startTransaction();
    }
    try {
      // 1. Ensure the winner row exists
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          address: winner,
          firstSeenLedger: 0,
          lastTxHash: null,
        })
        .orIgnore()
        .execute();

      // 2. Idempotency check
      const existing = await runner.manager.findOne(UserEntity, {
        where: { address: winner },
        select: { lastTxHash: true },
      });
      if (existing?.lastTxHash === txHash) {
        this.logger.debug(`RaffleFinalized ${raffleId} already applied for ${winner}, skipping`);
        if (ownTx) await runner.commitTransaction();
        return;
      }

      // 3. Atomic increments — add prize using PostgreSQL numeric arithmetic
      const safePrize = BigInt(prizeAmount || '0').toString(); // guard against non-numeric input
      await runner.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          totalRafflesWon: () => `total_raffles_won + 1`,
          totalPrizeXlm: () => `(total_prize_xlm::numeric + ${safePrize})::text`,
          lastTxHash: txHash,
        })
        .where('address = :winner', { winner })
        .execute();

      if (ownTx) await runner.commitTransaction();

      await this.cacheService.invalidateUserProfile(winner);
      await this.cacheService.invalidateLeaderboard();
    } catch (e) {
      if (ownTx) await runner.rollbackTransaction();
      throw e;
    } finally {
      if (ownTx) await runner.release();
    }
  }

  /**
   * Called when a RaffleCreated event is indexed.
   * Ensures the creator has a user row and updates first_seen_ledger.
   * No stats to increment — creation is tracked on the raffles table.
   */
  async handleRaffleCreated(
    rawCreator: string,
    createdLedger: number,
    queryRunner?: QueryRunner,
  ) {
    const creator = this.canonicalAddress(rawCreator, 'creator');
    this.logger.log(`Handling RaffleCreated by ${creator}`);
    const runner = queryRunner ?? this.dataSource.createQueryRunner();
    const ownTx = !queryRunner;
    if (ownTx) {
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
          lastTxHash: null,
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

      if (ownTx) await runner.commitTransaction();
    } catch (e) {
      if (ownTx) await runner.rollbackTransaction();
      throw e;
    } finally {
      if (ownTx) await runner.release();
    }
  }
}
