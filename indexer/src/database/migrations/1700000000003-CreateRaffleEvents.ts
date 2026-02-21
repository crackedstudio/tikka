import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

/**
 * Creates the `raffle_events` table — an append-only log of every decoded
 * contract event.  All writes are idempotent via the unique `tx_hash` index.
 */
export class CreateRaffleEvents1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "raffle_events",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
          },
          {
            name: "raffle_id",
            type: "integer",
            comment: "Contract-assigned raffle ID",
          },
          {
            name: "event_type",
            type: "varchar",
            length: "64",
            comment:
              "e.g. RaffleCreated | TicketPurchased | RaffleFinalized | ...",
          },
          {
            name: "ledger",
            type: "integer",
            comment: "Ledger sequence in which this event was emitted",
          },
          {
            name: "tx_hash",
            type: "varchar",
            length: "64",
            isUnique: true,
            comment: "Transaction hash — idempotency key",
          },
          {
            name: "payload_json",
            type: "jsonb",
            comment: "Full decoded event payload",
          },
          {
            name: "indexed_at",
            type: "timestamptz",
            default: "NOW()",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "raffle_events",
      new TableIndex({
        name: "idx_raffle_events_raffle_id",
        columnNames: ["raffle_id"],
      }),
    );
    await queryRunner.createIndex(
      "raffle_events",
      new TableIndex({
        name: "idx_raffle_events_event_type",
        columnNames: ["event_type"],
      }),
    );
    await queryRunner.createIndex(
      "raffle_events",
      new TableIndex({
        name: "idx_raffle_events_tx_hash",
        columnNames: ["tx_hash"],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("raffle_events", true);
  }
}
