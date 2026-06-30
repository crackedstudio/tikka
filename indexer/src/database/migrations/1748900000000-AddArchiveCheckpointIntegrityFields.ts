import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds integrity verification columns to archive_checkpoints.
 *
 * New columns:
 *  - integrity_hash             VARCHAR(64)  SHA-256 of canonicalized checkpoint state
 *  - last_verified_at           TIMESTAMPTZ  when the last verification ran
 *  - verification_failure_reason VARCHAR(500) human-readable failure reason
 *
 * Note: the existing 1748736000000-AddCheckpointIntegrityColumns migration targets
 * `indexer_cursor` (a separate concern). This migration adds the corresponding
 * fields specifically for the archive_checkpoints table, where resume-time
 * integrity verification is implemented.
 */
export class AddArchiveCheckpointIntegrityFields1748900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE archive_checkpoints
        ADD COLUMN IF NOT EXISTS integrity_hash VARCHAR(64),
        ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verification_failure_reason VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE archive_checkpoints
        DROP COLUMN IF EXISTS verification_failure_reason,
        DROP COLUMN IF EXISTS last_verified_at,
        DROP COLUMN IF EXISTS integrity_hash
    `);
  }
}
