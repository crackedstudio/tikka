import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebhookService } from "./webhook.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([WebhookEntity]),
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
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhooksModule {}
