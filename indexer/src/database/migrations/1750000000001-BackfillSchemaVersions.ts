import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillSchemaVersions1750000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set schema_version to 1 where it's NULL or 0
    await queryRunner.query(`
      UPDATE raffle_events
      SET schema_version = 1
      WHERE schema_version IS NULL OR schema_version = 0
    `);

    // Ensure the column has a NOT NULL constraint and default of 1 (even if previous migration tried to add it)
    await queryRunner.query(`
      ALTER TABLE raffle_events
      ALTER COLUMN schema_version SET NOT NULL,
      ALTER COLUMN schema_version SET DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // In down, we just drop the NOT NULL constraint and reset the default (we don't revert the backfill)
    await queryRunner.query(`
      ALTER TABLE raffle_events
      ALTER COLUMN schema_version DROP NOT NULL,
      ALTER COLUMN schema_version DROP DEFAULT
    `);
  }
}
