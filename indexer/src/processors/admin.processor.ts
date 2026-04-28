import { Injectable, Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { PlatformStateEntity } from '../database/entities/platform-state.entity';

/**
 * Admin / platform state updates. Raw `raffle_events` rows for these events are
 * bulk-inserted by IngestionDispatcherService before handlers run.
 */
@Injectable()
export class AdminProcessor {
  private readonly logger = new Logger(AdminProcessor.name);

  async handleContractPaused(
    admin: string,
    ledger: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update(PlatformStateEntity)
      .set({ paused: true, lastUpdatedLedger: ledger })
      .where('id = :id', { id: 'global' })
      .execute();

    this.logger.log(`Contract paused by ${admin} at ledger ${ledger}`);
  }

  async handleContractUnpaused(
    admin: string,
    ledger: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update(PlatformStateEntity)
      .set({ paused: false, lastUpdatedLedger: ledger })
      .where('id = :id', { id: 'global' })
      .execute();

    this.logger.log(`Contract unpaused by ${admin} at ledger ${ledger}`);
  }

  async handleAdminTransferProposed(
    currentAdmin: string,
    proposedAdmin: string,
    ledger: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update(PlatformStateEntity)
      .set({ pendingAdminAddress: proposedAdmin, lastUpdatedLedger: ledger })
      .where('id = :id', { id: 'global' })
      .execute();

    this.logger.log(`Admin transfer proposed: ${currentAdmin} → ${proposedAdmin}`);
  }

  async handleAdminTransferAccepted(
    oldAdmin: string,
    newAdmin: string,
    ledger: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
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

    this.logger.log(`Admin transfer accepted: ${oldAdmin} → ${newAdmin}`);
  }
}
