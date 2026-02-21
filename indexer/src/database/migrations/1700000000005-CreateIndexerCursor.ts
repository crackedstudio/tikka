import { MigrationInterface, QueryRunner, Table } from "typeorm";

/**
 * Creates the `indexer_cursor` table — holds a single singleton row (id=1)
 * tracking the last Stellar ledger and Horizon paging token processed.
 * Used by CursorManagerService to resume indexing after a crash or restart
 * without re-processing already-ingested events.
 */
export class CreateIndexerCursor1700000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "indexer_cursor",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            default: 1,
            comment: "Always 1 — singleton row constraint enforced by PK",
          },
          {
            name: "last_ledger",
            type: "integer",
            default: 0,
            comment: "Last Stellar ledger sequence fully processed",
          },
          {
            name: "last_paging_token",
            type: "varchar",
            length: "255",
            default: "''",
            comment: "Horizon SSE paging token for the last consumed event",
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

    // Pre-seed the singleton row so CursorManagerService can always UPDATE
    // without needing to decide between INSERT and UPDATE.
    await queryRunner.query(`
      INSERT INTO indexer_cursor (id, last_ledger, last_paging_token, updated_at)
      VALUES (1, 0, '', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("indexer_cursor", true);
  }
}
