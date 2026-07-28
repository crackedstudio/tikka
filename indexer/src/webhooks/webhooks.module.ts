import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebhookService } from "./webhook.service";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterEntity } from "../database/entities/webhook-dead-letter.entity";
import { DatabaseModule } from "../database/database.module";
import { WebhookDlqController } from "./webhook-dlq.controller";

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      WebhookEntity,
      WebhookDeliveryEntity,
      WebhookDeadLetterEntity,
    ]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
      },
    }),
    BullModule.registerQueue({
      name: "webhook",
    }),
  ],
  controllers: [WebhookDlqController],
  providers: [WebhookService, WebhookProcessor, WebhookDeadLetterService],
  exports: [WebhookService, WebhookDeadLetterService],
})
export class WebhooksModule {}
