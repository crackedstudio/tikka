import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `last_tx_hash` to the `users` table.
 * Used as an idempotency key in UserProcessor — prevents double-applying
 * the same event if the ingestion pipeline replays a transaction.
 */
export class AddUserLastTxHash1720000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_tx_hash VARCHAR(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS last_tx_hash
    `);
  }
}
