import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds checkpoint integrity columns to indexer_cursor (issue #560).
 *
 * New columns:
 *  - processed_event_count  BIGINT  cumulative events processed (monotonic)
 *  - saved_at               TIMESTAMPTZ  when the checkpoint was written
 *  - checkpoint_version     INTEGER  schema version for forward-compat migration
 */
export class AddCheckpointIntegrityColumns1748736000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE indexer_cursor
        ADD COLUMN IF NOT EXISTS processed_event_count BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS checkpoint_version INTEGER NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE indexer_cursor
        DROP COLUMN IF EXISTS processed_event_count,
        DROP COLUMN IF EXISTS saved_at,
        DROP COLUMN IF EXISTS checkpoint_version
    `);
  }
}
