import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

/**
 * Creates the `raffles` table and its supporting indexes.
 */
export class CreateRaffles1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the raffle status enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE raffle_status_enum AS ENUM ('open', 'drawing', 'finalized', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: "raffles",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            comment: "Contract-assigned raffle ID",
          },
          {
            name: "creator",
            type: "varchar",
            length: "56",
            comment: "Stellar account address of the raffle creator",
          },
          {
            name: "status",
            type: "raffle_status_enum",
            default: "'open'",
          },
          {
            name: "ticket_price",
            type: "varchar",
            length: "40",
            comment: "Price per ticket in stroops, stored as string",
          },
          {
            name: "asset",
            type: "varchar",
            length: "56",
            comment: "XLM or SEP-41 token contract address",
          },
          {
            name: "max_tickets",
            type: "integer",
          },
          {
            name: "tickets_sold",
            type: "integer",
            default: 0,
          },
          {
            name: "end_time",
            type: "bigint",
            comment: "Unix timestamp (seconds) when the raffle closes",
          },
          {
            name: "winner",
            type: "varchar",
            length: "56",
            isNullable: true,
            comment: "Winning Stellar address — null until FINALIZED",
          },
          {
            name: "prize_amount",
            type: "varchar",
            length: "40",
            isNullable: true,
            comment: "Prize amount in stroops — null until FINALIZED",
          },
          {
            name: "created_ledger",
            type: "integer",
            comment: "Ledger sequence when the raffle was created",
          },
          {
            name: "finalized_ledger",
            type: "integer",
            isNullable: true,
            comment:
              "Ledger sequence when the raffle was finalized or cancelled",
          },
          {
            name: "metadata_cid",
            type: "varchar",
            length: "255",
            isNullable: true,
            comment: "IPFS CID for off-chain metadata",
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "NOW()",
          },
        ],
      }),
      true, // ifNotExists
    );

    await queryRunner.createIndex(
      "raffles",
      new TableIndex({ name: "idx_raffles_status", columnNames: ["status"] }),
    );
    await queryRunner.createIndex(
      "raffles",
      new TableIndex({ name: "idx_raffles_creator", columnNames: ["creator"] }),
    );
    await queryRunner.createIndex(
      "raffles",
      new TableIndex({
        name: "idx_raffles_created_at",
        columnNames: ["created_at"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("raffles", true);
    await queryRunner.query(`DROP TYPE IF EXISTS raffle_status_enum`);
  }
}
