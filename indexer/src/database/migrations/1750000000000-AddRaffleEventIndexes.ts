import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRaffleEventIndexes1750000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure the column exists before indexing
    await queryRunner.query(`
      ALTER TABLE "raffle_events" ADD COLUMN IF NOT EXISTS "contract_address" varchar(64)
    `);

    // Note: The index for event_type may already exist as "idx_raffle_events_event_type"
    // from the initial migration, but we create it here with IF NOT EXISTS to be safe
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffle_events_event_type_btree" ON "raffle_events" USING btree ("event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffle_events_contract_address_btree" ON "raffle_events" USING btree ("contract_address")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_raffle_events_contract_ledger_composite" ON "raffle_events" ("contract_address", "ledger")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffle_events_contract_ledger_composite"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffle_events_contract_address_btree"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_raffle_events_event_type_btree"`);
    // Not dropping the column in down() to avoid data loss if it already existed
  }
}
