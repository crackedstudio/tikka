import { MigrationInterface, QueryRunner, Table } from "typeorm";

/**
 * Creates the `platform_stats` table — one row per UTC calendar day,
 * written by the daily stats roll-up cron job.
 */
export class CreatePlatformStats1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "platform_stats",
        columns: [
          {
            name: "date",
            type: "date",
            isPrimary: true,
            comment: "UTC calendar date for this roll-up row",
          },
          {
            name: "total_raffles",
            type: "integer",
            default: 0,
            comment: "Total raffles created on this day",
          },
          {
            name: "total_tickets",
            type: "integer",
            default: 0,
            comment: "Total tickets sold on this day",
          },
          {
            name: "total_volume_xlm",
            type: "varchar",
            length: "40",
            default: "'0'",
            comment: "Total XLM volume in stroops on this day",
          },
          {
            name: "unique_participants",
            type: "integer",
            default: 0,
            comment: "Unique participant addresses active on this day",
          },
          {
            name: "prizes_distributed_xlm",
            type: "varchar",
            length: "40",
            default: "'0'",
            comment: "Total prize XLM distributed to winners on this day",
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("platform_stats", true);
  }
}
