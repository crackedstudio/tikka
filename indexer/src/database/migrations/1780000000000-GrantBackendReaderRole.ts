import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GrantBackendReaderRole
 *
 * Fixes issue #1524: the previous baseline-schema.sql DO $$ block referenced
 * 'raffle' and 'participant', neither of which exist. This migration applies
 * the correct SELECT-only grant to every real indexer-owned table derived from
 * the @Entity(...) decorators in indexer/src/database/entities/.
 *
 * Design decisions:
 * - The role is created if it does not exist so the migration is idempotent.
 * - Each table is explicitly revoked then re-granted to avoid cumulative-
 *   privilege surprises on environments that ran a partial previous attempt.
 * - A hard RAISE EXCEPTION (not a silent IF EXISTS) is used so any future
 *   drift between this list and the real schema surfaces immediately rather
 *   than being silently ignored.
 *
 * To roll back: DROP ROLE backend_reader (only safe when no app user relies
 * on it).  The down() below only removes the grants, not the role itself,
 * because other services may have granted the role to a login user.
 */
export class GrantBackendReaderRole1780000000000 implements MigrationInterface {
  name = 'GrantBackendReaderRole1780000000000';

  /** Canonical list of indexer-owned table names (matches @Entity decorators). */
  private static readonly INDEXER_TABLES: readonly string[] = [
    'raffles',
    'tickets',
    'users',
    'raffle_events',
    'platform_stats',
    'platform_state',
    'indexer_cursor',
    'dead_letter_events',
    'webhooks',
    'webhook_deliveries',
    'webhook_dead_letter_deliveries',
    'archive_checkpoints',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create the role if it does not already exist.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'backend_reader') THEN
          CREATE ROLE backend_reader NOLOGIN;
        END IF;
      END $$
    `);

    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO backend_reader`);

    for (const tbl of GrantBackendReaderRole1780000000000.INDEXER_TABLES) {
      // Fail loudly if the table is missing — silent success is what caused #1524.
      const rows: Array<{ exists: boolean }> = await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
         ) AS "exists"`,
        [tbl],
      );

      if (!rows[0]?.exists) {
        throw new Error(
          `GrantBackendReaderRole: table public.${tbl} does not exist. ` +
            `Run all preceding migrations before this one.`,
        );
      }

      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE public.${tbl} FROM backend_reader`,
      );
      await queryRunner.query(
        `GRANT SELECT ON TABLE public.${tbl} TO backend_reader`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tbl of GrantBackendReaderRole1780000000000.INDEXER_TABLES) {
      const rows: Array<{ exists: boolean }> = await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
         ) AS "exists"`,
        [tbl],
      );

      if (!rows[0]?.exists) {
        continue; // Table may have been dropped by an earlier down(); skip gracefully.
      }

      await queryRunner.query(
        `REVOKE ALL PRIVILEGES ON TABLE public.${tbl} FROM backend_reader`,
      );
    }

    await queryRunner.query(`REVOKE USAGE ON SCHEMA public FROM backend_reader`);
  }
}
