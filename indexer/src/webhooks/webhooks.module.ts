import { Module, OnModuleInit } from "@nestjs/common";
import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { WebhookService } from "./webhook.service";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { DatabaseModule } from "../database/database.module";
import { MetricsModule } from "../metrics/metrics.module";
import { MetricsService } from "../metrics/metrics.service";

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([WebhookEntity]),
    MetricsModule,
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
export class WebhooksModule implements OnModuleInit {
  constructor(
    @InjectQueue("webhook") private readonly webhookQueue: Queue,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit() {
    this.metricsService.registerQueue("webhook", this.webhookQueue);
  }
}
