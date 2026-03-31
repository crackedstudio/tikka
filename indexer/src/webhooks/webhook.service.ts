import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookEntity } from "../database/entities/webhook.entity";

export interface WebhookPayload {
  eventType: "RaffleCreated" | "RaffleFinalized";
  raffleId: number;
  timestamp: Date;
  data: Record<string, any>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEntity)
    private webhookRepo: Repository<WebhookEntity>,
    @InjectQueue("webhook") private webhookQueue: Queue,
  ) {}

  async dispatchEvent(payload: WebhookPayload) {
    const webhooks = await this.webhookRepo.find({
      where: {
        isActive: true,
        supportedEvents: payload.eventType, // TypeORM array contains check
      },
    });

    for (const webhook of webhooks) {
      await this.webhookQueue.add(
        "send",
        {
          url: webhook.url,
          payload,
        },
        {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: 10,
          removeOnFail: 50,
          timeout: 30000, // 30s for slow receivers
        },
      );
      this.logger.log(
        `Queued webhook dispatch to ${webhook.url} for ${payload.eventType}:${payload.raffleId}`,
      );
    }
  }

  async registerWebhook(
    url: string,
    events: ("RaffleCreated" | "RaffleFinalized")[],
  ) {
    const webhook = this.webhookRepo.create({ url, supportedEvents: events });
    await this.webhookRepo.save(webhook);
  }

  async onApplicationBootstrap() {
    // Processors will inject this service
  }
}
