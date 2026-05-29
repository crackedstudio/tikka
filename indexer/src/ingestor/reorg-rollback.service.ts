import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ReorgRollbackService {
  private readonly logger = new Logger(ReorgRollbackService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Rolls back all indexed state from ledger `fromLedger` onwards.
   * Deletes raffle_events, tickets, and raffles created at or after the divergence point.
   * Also trims the ledger_hashes ring in the cursor to the divergence point.
   */
  async rollback(fromLedger: number): Promise<void> {
    this.logger.error(
      `Rolling back state from ledger ${fromLedger} onwards due to reorg`,
    );

    await this.dataSource.transaction(async (manager) => {
      // Delete events at or after the reorg ledger
      await manager.query(
        `DELETE FROM raffle_events WHERE ledger >= $1`,
        [fromLedger],
      );

      // Delete tickets purchased at or after the reorg ledger
      await manager.query(
        `DELETE FROM tickets WHERE purchased_at_ledger >= $1`,
        [fromLedger],
      );

      // Delete raffles created at or after the reorg ledger
      await manager.query(
        `DELETE FROM raffles WHERE created_ledger >= $1`,
        [fromLedger],
      );

      // Trim ledger_hashes ring to entries before the reorg point
      await manager.query(
        `UPDATE indexer_cursor
         SET ledger_hashes = (
           SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
           FROM jsonb_array_elements(ledger_hashes) AS elem
           WHERE (elem->>'ledger')::int < $1
         ),
         last_ledger = GREATEST(0, $1 - 1)
         WHERE id = 1`,
        [fromLedger],
      );
    });

    this.logger.log(`Rollback complete: removed state from ledger ${fromLedger} onwards`);
  }
}
