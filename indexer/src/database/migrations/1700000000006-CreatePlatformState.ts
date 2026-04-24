import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreatePlatformState1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "platform_state",
        columns: [
          {
            name: "id",
            type: "varchar",
            isPrimary: true,
            default: "'global'",
            comment: "Always 'global' — singleton row",
          },
          {
            name: "paused",
            type: "boolean",
            default: false,
          },
          {
            name: "admin_address",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "pending_admin_address",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "last_updated_ledger",
            type: "integer",
            default: 0,
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

    // Pre-seed the singleton row
    await queryRunner.query(`
      INSERT INTO platform_state (id, paused, last_updated_ledger, updated_at)
      VALUES ('global', false, 0, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("platform_state", true);
  }
}
