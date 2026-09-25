import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Pagination Index Optimization (#1584)
 *
 * Adds composite indexes optimized for cursor-based pagination on high-churn lists.
 * These ensure stable, fast pagination even when rows are being inserted mid-scan.
 *
 * Index strategy:
 * 1. Raffles: (createdAt DESC, id ASC) - supports keyset pagination on /raffles
 * 2. Raffles with filters: (status DESC, createdAt DESC, id ASC) - filters then pagination
 * 3. Users: Existing leaderboard indexes already optimized
 * 4. Participants: (raffleId, purchasedAtLedger ASC) - for raffle participant pagination
 *
 * All use IF NOT EXISTS for idempotency and forward compatibility.
 */
export class AddPaginationIndexes1785000000000 implements MigrationInterface {
  name = "AddPaginationIndexes1785000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Raffles: Cursor pagination (createdAt DESC + id ASC for tie-breaking) ---
    // This is the primary sort for /raffles and supports stable keyset pagination
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffles_created_at_id"
      ON "raffles" ("created_at" DESC, "id" ASC)
    `);

    // --- Raffles with status filter: Supports filtered list queries efficiently ---
    // Used when filtering by status (open/drawing/finalized/cancelled) then paging
    // Covers: SELECT * FROM raffles WHERE status = ? ORDER BY created_at DESC LIMIT ?
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffles_status_created_at_id"
      ON "raffles" ("status" ASC, "created_at" DESC, "id" ASC)
    `);

    // --- Participants: Pagination by first purchase order ---
    // Used in GET /raffles/:id/participants pagination
    // Covers: SELECT ... FROM tickets WHERE raffle_id = ? GROUP BY owner
    //         ORDER BY MIN(purchased_at_ledger) LIMIT ? OFFSET ?
    // Note: GROUP BY already on owner, so index helps scan order
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tickets_raffle_id_purchased_at_ledger"
      ON "tickets" ("raffle_id" ASC, "purchased_at_ledger" ASC)
    `);

    // --- Users (Leaderboard): Indexes already exist from AuditHotPathIndexes ---
    // Existing indexes are comprehensive and support all leaderboard sort modes:
    // - IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS
    // - IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS
    // - IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS
    // Each covers: sort mode DESC, then address ASC for lexicographic tiebreaker
    // No additional indexes needed for leaderboard

    // --- Optional: Consider adding for future optimizations (commented out) ---
    // If pagination on timestamps (endTime, finalizedAt) is added in the future,
    // uncomment the following:
    //
    // await queryRunner.query(`
    //   CREATE INDEX IF NOT EXISTS "idx_raffles_end_time"
    //   ON "raffles" ("end_time" DESC)
    // `);
    //
    // await queryRunner.query(`
    //   CREATE INDEX IF NOT EXISTS "idx_raffles_finalized_ledger"
    //   ON "raffles" ("finalized_ledger" DESC) WHERE "finalized_ledger" IS NOT NULL
    // `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tickets_raffle_id_purchased_at_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffles_status_created_at_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffles_created_at_id"`);
  }
}
