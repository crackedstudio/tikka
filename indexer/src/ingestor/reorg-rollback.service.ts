import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface RollbackAuditEntry {
  startedAt: Date;
  completedAt?: Date;
  fromLedger: number;
  affectedEntities: {
    raffleEvents: number;
    tickets: number;
    raffles: number;
    deadLetterEvents: number;
    platformStats: number;
    users: number;
  };
  replayCursor: number;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}

@Injectable()
export class ReorgRollbackService {
  private readonly logger = new Logger(ReorgRollbackService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Atomically rolls back all indexed state from ledger `fromLedger` onwards.
   * 
   * Comprehensive rollback covers:
   * - Raw events: raffle_events, dead_letter_events
   * - Core entities: tickets, raffles  
   * - Derived data: user aggregates, platform stats
   * - Indexer state: cursor position and ledger hashes
   * 
   * Ensures transactional consistency - either complete rollback succeeds
   * or no mutations are persisted.
   */
  async rollback(fromLedger: number): Promise<RollbackAuditEntry> {
    const audit: RollbackAuditEntry = {
      startedAt: new Date(),
      fromLedger,
      affectedEntities: {
        raffleEvents: 0,
        tickets: 0, 
        raffles: 0,
        deadLetterEvents: 0,
        platformStats: 0,
        users: 0,
      },
      replayCursor: Math.max(0, fromLedger - 1),
      success: false,
    };

    this.logger.error(
      `Reorg rollback starting: ledger ${fromLedger} onwards`,
    );

    try {
      await this.dataSource.transaction(async (manager) => {
        // Count affected entities before deletion for audit
        const [
          eventCount,
          ticketCount, 
          raffleCount,
          dleCount,
        ] = await Promise.all([
          manager.query(`SELECT COUNT(*) as count FROM raffle_events WHERE ledger >= $1`, [fromLedger]),
          manager.query(`SELECT COUNT(*) as count FROM tickets WHERE purchased_at_ledger >= $1`, [fromLedger]),
          manager.query(`SELECT COUNT(*) as count FROM raffles WHERE created_ledger >= $1`, [fromLedger]),
          manager.query(`SELECT COUNT(*) as count FROM dead_letter_events WHERE ledger >= $1`, [fromLedger]),
        ]);

        audit.affectedEntities.raffleEvents = parseInt(eventCount[0]?.count || '0', 10);
        audit.affectedEntities.tickets = parseInt(ticketCount[0]?.count || '0', 10);
        audit.affectedEntities.raffles = parseInt(raffleCount[0]?.count || '0', 10);
        audit.affectedEntities.deadLetterEvents = parseInt(dleCount[0]?.count || '0', 10);

        // Delete raw events at or after the reorg ledger
        await manager.query(`DELETE FROM raffle_events WHERE ledger >= $1`, [fromLedger]);
        await manager.query(`DELETE FROM dead_letter_events WHERE ledger >= $1`, [fromLedger]);

        // Delete tickets purchased at or after the reorg ledger
        await manager.query(`DELETE FROM tickets WHERE purchased_at_ledger >= $1`, [fromLedger]);

        // Delete raffles created at or after the reorg ledger  
        await manager.query(`DELETE FROM raffles WHERE created_ledger >= $1`, [fromLedger]);

        // Recalculate user aggregates after ticket/raffle deletions
        const affectedUsers = await manager.query(`
          SELECT DISTINCT u.address FROM users u
          WHERE EXISTS (
            SELECT 1 FROM tickets t WHERE t.owner = u.address
            UNION ALL
            SELECT 1 FROM raffles r WHERE r.creator = u.address OR r.winner = u.address  
          )
        `);

        audit.affectedEntities.users = affectedUsers.length;

        // Recalculate user statistics from remaining data
        await manager.query(`
          UPDATE users SET 
            total_tickets_bought = (
              SELECT COALESCE(COUNT(*), 0) FROM tickets WHERE owner = users.address
            ),
            total_raffles_entered = (
              SELECT COALESCE(COUNT(DISTINCT raffle_id), 0) FROM tickets WHERE owner = users.address
            ),
            total_raffles_won = (
              SELECT COALESCE(COUNT(*), 0) FROM raffles WHERE winner = users.address AND status = 'finalized'
            ),
            total_prize_xlm = (
              SELECT COALESCE(SUM(prize_amount::bigint), 0)::text FROM raffles 
              WHERE winner = users.address AND status = 'finalized'
            )
        `);

        // Remove orphaned users with no activity
        await manager.query(`
          DELETE FROM users 
          WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE owner = users.address)
            AND NOT EXISTS (SELECT 1 FROM raffles WHERE creator = users.address OR winner = users.address)
        `);

        // Recalculate platform stats affected by rollback
        const statsToRecalc = await manager.query(`
          SELECT DISTINCT DATE(created_at) as date FROM raffles 
          WHERE created_ledger >= $1
          UNION
          SELECT DISTINCT DATE(indexed_at) as date FROM tickets
          WHERE purchased_at_ledger >= $1  
        `, [fromLedger]);

        audit.affectedEntities.platformStats = statsToRecalc.length;

        // Delete affected platform stats - they'll be recalculated by cron
        for (const row of statsToRecalc) {
          await manager.query(`DELETE FROM platform_stats WHERE date = $1`, [row.date]);
        }

        // Update platform state to reflect rollback
        await manager.query(`
          UPDATE platform_state 
          SET last_updated_ledger = $1
          WHERE last_updated_ledger >= $1
        `, [audit.replayCursor, fromLedger]);

        // Trim ledger_hashes ring and reset cursor to safe replay position
        await manager.query(`
          UPDATE indexer_cursor
          SET ledger_hashes = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(ledger_hashes) AS elem
            WHERE (elem->>'ledger')::int < $1
          ),
          last_ledger = $2
          WHERE id = 1
        `, [fromLedger, audit.replayCursor]);
      });

      audit.success = true;
      audit.completedAt = new Date();
      audit.durationMs = audit.completedAt.getTime() - audit.startedAt.getTime();

      this.logger.log(
        `Reorg rollback completed: ledger ${fromLedger}+, ` +
        `${audit.affectedEntities.raffleEvents + audit.affectedEntities.tickets + audit.affectedEntities.raffles} entities, ` +
        `${audit.durationMs}ms`
      );

    } catch (error) {
      audit.success = false;
      audit.errorMessage = error instanceof Error ? error.message : String(error);
      audit.completedAt = new Date();
      audit.durationMs = audit.completedAt.getTime() - audit.startedAt.getTime();
      
      this.logger.error(
        `Reorg rollback failed: ledger ${fromLedger}, error: ${audit.errorMessage}`
      );
      
      throw error;
    }

    return audit;
  }
}
