import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateArchiveCheckpoints1748589373000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "archive_checkpoints",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "job_type",
            type: "varchar",
            length: "64",
            isNullable: false,
          },
          {
            name: "last_processed_timestamp",
            type: "timestamptz",
            isNullable: true,
          },
          {
            name: "last_processed_id",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "total_archived",
            type: "integer",
            default: 0,
            isNullable: false,
          },
          {
            name: "batch_number",
            type: "integer",
            default: 0,
            isNullable: false,
          },
          {
            name: "status",
            type: "varchar",
            length: "20",
            default: "'in_progress'",
            isNullable: false,
          },
          {
            name: "config_snapshot",
            type: "jsonb",
            isNullable: false,
          },
          {
            name: "started_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "completed_at",
            type: "timestamptz",
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create index for efficient checkpoint lookup
    await queryRunner.createIndex(
      "archive_checkpoints",
      new TableIndex({
        name: "idx_archive_checkpoints_job_type_status",
        columnNames: ["job_type", "status"],
      }),
    );

    // Create index for timestamp-based queries
    await queryRunner.createIndex(
      "archive_checkpoints",
      new TableIndex({
        name: "idx_archive_checkpoints_started_at",
        columnNames: ["started_at"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "archive_checkpoints",
      "idx_archive_checkpoints_started_at",
    );
    await queryRunner.dropIndex(
      "archive_checkpoints",
      "idx_archive_checkpoints_job_type_status",
    );
    await queryRunner.dropTable("archive_checkpoints");
  }
}
