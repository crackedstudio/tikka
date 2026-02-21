import { MigrationInterface, QueryRunner, Table } from "typeorm";

/**
 * Creates the `users` table.
 * Keyed by Stellar address (natural PK — no serial needed).
 */
export class CreateUsers1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "address",
            type: "varchar",
            length: "56",
            isPrimary: true,
            comment: "Stellar account address",
          },
          {
            name: "total_tickets_bought",
            type: "integer",
            default: 0,
          },
          {
            name: "total_raffles_entered",
            type: "integer",
            default: 0,
          },
          {
            name: "total_raffles_won",
            type: "integer",
            default: 0,
          },
          {
            name: "total_prize_xlm",
            type: "varchar",
            length: "40",
            default: "'0'",
            comment: "Cumulative prize winnings in stroops, stored as string",
          },
          {
            name: "first_seen_ledger",
            type: "integer",
            comment: "First ledger sequence this address appeared in",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "NOW()",
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("users", true);
  }
}
