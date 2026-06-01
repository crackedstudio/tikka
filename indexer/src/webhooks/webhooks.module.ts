import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebhookService } from "./webhook.service";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "./webhook-delivery.entity";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([WebhookEntity, WebhookDeliveryEntity]),
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
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhooksModule {}
