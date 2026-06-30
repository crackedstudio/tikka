import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWebhookDeliveries1760000000000 implements MigrationInterface {
  name = "CreateWebhookDeliveries1760000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "webhookUrl" character varying NOT NULL,
        "eventType" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying NOT NULL,
        "attempts" integer NOT NULL,
        "errorResponse" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries_id" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
  }
}
