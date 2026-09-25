import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hot-path index audit (#1122).
 *
 * Lands indexes that static query review + the orphaned
 * `OptimizeLeaderboard1711620000000` (outside `database/migrations/`) intended
 * to provide. All statements use IF NOT EXISTS / IF EXISTS so re-runs and
 * partially-applied environments are safe.
 *
 * See: docs/performance/indexer-index-audit.md
 */
export class AuditHotPathIndexes1770000000000 implements MigrationInterface {
  name = "AuditHotPathIndexes1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Leaderboard (users) — previously unapplied orphan migration ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS"
      ON "users" ("total_raffles_won" DESC, "address" ASC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS"
      ON "users" ((CAST("total_prize_xlm" AS NUMERIC)) DESC, "address" ASC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS"
      ON "users" ("total_tickets_bought" DESC, "address" ASC)
    `);

    // --- Tickets: owner history + first-entry check in UserProcessor ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tickets_owner_raffle_id"
      ON "tickets" ("owner", "raffle_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tickets_purchased_at_ledger"
      ON "tickets" ("purchased_at_ledger")
    `);

    // --- Raffles: filtered list + reorg rollback ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffles_status_created_at"
      ON "raffles" ("status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffles_created_ledger"
      ON "raffles" ("created_ledger")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffles_winner_not_null"
      ON "raffles" ("winner")
      WHERE "winner" IS NOT NULL
    `);

    // --- Raffle events: reorg range + archive cursor ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffle_events_ledger"
      ON "raffle_events" ("ledger")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffle_events_indexed_at_id"
      ON "raffle_events" ("indexed_at" ASC, "id" ASC)
    `);

    // --- Dead letter: entity declared idx_dle_ledger but create migration omitted it ---
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dle_ledger"
      ON "dead_letter_events" ("ledger")
    `);

    // Composite replay index only when replayed_at exists (column added in entity
    // before a dedicated column migration landed — avoid failing fresh DBs).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dead_letter_events' AND column_name = 'replayed_at'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_dle_replay_eligible"
          ON "dead_letter_events" ("replayed_at", "ledger");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dle_replay_eligible"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dle_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffle_events_indexed_at_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffle_events_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffles_winner_not_null"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffles_created_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffles_status_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tickets_purchased_at_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tickets_owner_raffle_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS"`,
    );
  }
}
