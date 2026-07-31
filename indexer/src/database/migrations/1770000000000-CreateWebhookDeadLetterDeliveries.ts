import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWebhookDeadLetterDeliveries1770000000000
  implements MigrationInterface
{
  name = "CreateWebhookDeadLetterDeliveries1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_dead_letter_deliveries" (
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
      `CREATE INDEX "idx_whdl_status" ON "webhook_dead_letter_deliveries" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_whdl_created_at" ON "webhook_dead_letter_deliveries" ("createdAt")`,
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
