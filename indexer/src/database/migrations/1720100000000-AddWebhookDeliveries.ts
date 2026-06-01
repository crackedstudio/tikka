import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWebhookDeliveries1720100000000 implements MigrationInterface {
  name = "AddWebhookDeliveries1720100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add signing_secret column to webhooks table
    await queryRunner.query(`
      ALTER TABLE "webhooks"
      ADD COLUMN "signing_secret" character varying;
    `);

    // Create webhook_deliveries table
    await queryRunner.query(`
      CREATE TYPE "webhook_delivery_status_enum" AS ENUM (
        'pending',
        'sending',
        'success',
        'failed',
        'permanent_failure'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "webhook_id" uuid NOT NULL,
        "event_id" character varying NOT NULL,
        "event_type" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" "webhook_delivery_status_enum" NOT NULL DEFAULT 'pending',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "last_status_code" integer,
        "last_error" text,
        "next_retry_at" TIMESTAMP WITH TIME ZONE,
        "last_attempt_at" TIMESTAMP WITH TIME ZONE,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_webhook_deliveries_event_id" UNIQUE ("event_id"),
        CONSTRAINT "FK_webhook_deliveries_webhook" FOREIGN KEY ("webhook_id")
          REFERENCES "webhooks"("id") ON DELETE CASCADE
      );
    `);

    // Create indexes for efficient queries
    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_event_id" ON "webhook_deliveries" ("event_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_webhook_created" ON "webhook_deliveries" ("webhook_id", "created_at");
    `);

    // Index for finding pending retries
    await queryRunner.query(`
      CREATE INDEX "idx_webhook_deliveries_retry" ON "webhook_deliveries" ("status", "next_retry_at")
      WHERE "status" = 'failed' AND "next_retry_at" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_webhook_deliveries_retry"`);
    await queryRunner.query(
      `DROP INDEX "idx_webhook_deliveries_webhook_created"`,
    );
    await queryRunner.query(`DROP INDEX "idx_webhook_deliveries_event_id"`);
    await queryRunner.query(`DROP INDEX "idx_webhook_deliveries_status"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
    await queryRunner.query(`DROP TYPE "webhook_delivery_status_enum"`);
    await queryRunner.query(`
      ALTER TABLE "webhooks"
      DROP COLUMN "signing_secret"
    `);
  }
}
