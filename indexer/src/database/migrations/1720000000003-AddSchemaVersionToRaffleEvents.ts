import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchemaVersionToRaffleEvents1720000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE raffle_events
      ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE raffle_events
      DROP COLUMN IF EXISTS schema_version
    `);
  }
}
