import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWebhooksTable1720000000000 implements MigrationInterface {
  name = "AddWebhooksTable1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "url" character varying NOT NULL,
        "supported_events" TEXT[],
        "is_active" boolean NOT NULL DEFAULT true,
        "failure_count" integer NOT NULL DEFAULT 0,
        "last_failure_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_webhooks_url" UNIQUE ("url")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_webhooks_active_events" ON "webhooks" ("is_active", "supported_events");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_webhooks_active_events"`);
    await queryRunner.query(`DROP TABLE "webhooks"`);
  }
}

