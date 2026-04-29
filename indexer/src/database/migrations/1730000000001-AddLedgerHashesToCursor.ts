import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerHashesToCursor1730000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE indexer_cursor
      ADD COLUMN IF NOT EXISTS ledger_hashes jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE indexer_cursor DROP COLUMN IF EXISTS ledger_hashes
    `);
  }
}
