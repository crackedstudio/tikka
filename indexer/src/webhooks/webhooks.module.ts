import { Module, OnModuleInit } from "@nestjs/common";
import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { WebhookService } from "./webhook.service";
import { WebhookProcessor } from "./webhook.processor";
import { WebhookDlqController } from "./webhook-dlq.controller";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterEntity } from "../database/entities/webhook-dead-letter.entity";
import { DatabaseModule } from "../database/database.module";
import { MetricsModule } from "../metrics/metrics.module";
import { MetricsService } from "../metrics/metrics.service";

@Module({
  imports: [
    DatabaseModule,
    // Listed explicitly rather than relying on DatabaseModule's exports: this
    // module injects all three repositories, and the dead-letter one was
    // missing from every forFeature/entities list — so WebhookDeadLetterService
    // could not be constructed and the indexer failed to boot.
    TypeOrmModule.forFeature([
      WebhookEntity,
      WebhookDeliveryEntity,
      WebhookDeadLetterEntity,
    ]),
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
