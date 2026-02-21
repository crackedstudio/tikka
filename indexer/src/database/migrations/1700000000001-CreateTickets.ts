import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from "typeorm";

/**
 * Creates the `tickets` table with a FK to `raffles` and supporting indexes.
 * Depends on: 1700000000000-CreateRaffles
 */
export class CreateTickets1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "tickets",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            comment: "Contract-assigned ticket ID",
          },
          {
            name: "raffle_id",
            type: "integer",
            comment: "FK → raffles.id",
          },
          {
            name: "owner",
            type: "varchar",
            length: "56",
            comment: "Stellar account address that owns this ticket",
          },
          {
            name: "purchased_at_ledger",
            type: "integer",
            comment: "Ledger sequence when the ticket was purchased",
          },
          {
            name: "purchase_tx_hash",
            type: "varchar",
            length: "64",
            isUnique: true,
            comment: "Purchase transaction hash — idempotency key",
          },
          {
            name: "refunded",
            type: "boolean",
            default: false,
          },
          {
            name: "refund_tx_hash",
            type: "varchar",
            length: "64",
            isNullable: true,
            comment: "Refund transaction hash — null until refunded",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "tickets",
      new TableIndex({
        name: "idx_tickets_raffle_id",
        columnNames: ["raffle_id"],
      }),
    );
    await queryRunner.createIndex(
      "tickets",
      new TableIndex({ name: "idx_tickets_owner", columnNames: ["owner"] }),
    );
    await queryRunner.createIndex(
      "tickets",
      new TableIndex({
        name: "idx_tickets_purchase_tx_hash",
        columnNames: ["purchase_tx_hash"],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      "tickets",
      new TableForeignKey({
        name: "fk_tickets_raffle_id",
        columnNames: ["raffle_id"],
        referencedTableName: "raffles",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("tickets", true);
  }
}
