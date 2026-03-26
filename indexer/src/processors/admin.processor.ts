import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { PlatformStateEntity } from '../database/entities/platform-state.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';

@Injectable()
export class AdminProcessor {
  private readonly logger = new Logger(AdminProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  async handleContractPaused(
    admin: string,
    ledger: number,
    txHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId: 0,
          eventType: 'ContractPaused',
          ledger,
          txHash,
          payloadJson: { admin },
        })
        .orIgnore()
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update(PlatformStateEntity)
        .set({ paused: true, lastUpdatedLedger: ledger })
        .where('id = :id', { id: 'global' })
        .execute();

      await queryRunner.commitTransaction();
      this.logger.log(`Contract paused by ${admin} at ledger ${ledger}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleContractUnpaused(
    admin: string,
    ledger: number,
    txHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId: 0,
          eventType: 'ContractUnpaused',
          ledger,
          txHash,
          payloadJson: { admin },
        })
        .orIgnore()
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update(PlatformStateEntity)
        .set({ paused: false, lastUpdatedLedger: ledger })
        .where('id = :id', { id: 'global' })
        .execute();

      await queryRunner.commitTransaction();
      this.logger.log(`Contract unpaused by ${admin} at ledger ${ledger}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleAdminTransferProposed(
    currentAdmin: string,
    proposedAdmin: string,
    ledger: number,
    txHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId: 0,
          eventType: 'AdminTransferProposed',
          ledger,
          txHash,
          payloadJson: { current_admin: currentAdmin, proposed_admin: proposedAdmin },
        })
        .orIgnore()
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update(PlatformStateEntity)
        .set({ pendingAdminAddress: proposedAdmin, lastUpdatedLedger: ledger })
        .where('id = :id', { id: 'global' })
        .execute();

      await queryRunner.commitTransaction();
      this.logger.log(`Admin transfer proposed: ${currentAdmin} → ${proposedAdmin}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async handleAdminTransferAccepted(
    oldAdmin: string,
    newAdmin: string,
    ledger: number,
    txHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values({
          raffleId: 0,
          eventType: 'AdminTransferAccepted',
          ledger,
          txHash,
          payloadJson: { old_admin: oldAdmin, new_admin: newAdmin },
        })
        .orIgnore()
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .update(PlatformStateEntity)
        .set({
          adminAddress: newAdmin,
          pendingAdminAddress: null,
          lastUpdatedLedger: ledger,
        })
        .where('id = :id', { id: 'global' })
        .execute();

      await queryRunner.commitTransaction();
      this.logger.log(`Admin transfer accepted: ${oldAdmin} → ${newAdmin}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
