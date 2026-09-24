import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Webhook dead-letter persistence for exhausted deliveries (#1240).
 *
 * Renumbered from `1770000000000` to the timestamp the file was originally
 * committed with (2026-07-31T16:03:11Z). It shared that prefix with
 * `1770000000000-AuditHotPathIndexes`, which left the relative order of the two
 * files up to directory read order. The two touch different tables, so nothing
 * about the change alters the resulting schema on a fresh database.
 *
 * On a database that already recorded the old name, either fix the history row
 * before upgrading:
 *
 *   UPDATE migrations
 *      SET name = 'CreateWebhookDeadLetterDeliveries1785513791000'
 *    WHERE name = 'CreateWebhookDeadLetterDeliveries1770000000000';
 *
 * or simply let it run again — every statement below is guarded, so a re-run is
 * a no-op. See docs/database/migration-timestamp-exceptions.md.
 */
export class CreateWebhookDeadLetterDeliveries1785513791000
  implements MigrationInterface
{
  name = "CreateWebhookDeadLetterDeliveries1785513791000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "webhook_dead_letter_deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "webhookUrl" character varying NOT NULL,
        "eventType" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "errorResponse" text,
        "reason" character varying(32) NOT NULL DEFAULT 'HTTP_ERROR',
        "retryCount" integer NOT NULL DEFAULT 0,
        "retryable" boolean NOT NULL DEFAULT true,
        "replayedAt" timestamptz,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whdl_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_whdl_status" ON "webhook_dead_letter_deliveries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_whdl_created_at" ON "webhook_dead_letter_deliveries" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_whdl_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_whdl_status"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "webhook_dead_letter_deliveries"`,
    );
  }
}
