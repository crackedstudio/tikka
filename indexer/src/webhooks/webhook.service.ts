import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { DEFAULT_JOB_OPTIONS } from "../processors/queue-options";

export interface WebhookPayload {
  eventType: string;
  data: Record<string, any>;
}

const WEBHOOK_QUEUE = "webhook";

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue,
  ) {}

  async dispatch(eventType: string, payload: Record<string, any>) {
    const webhooks = await this.webhookRepo.find({
      where: { isActive: true },
    });

    const targetWebhooks = webhooks.filter((w) =>
      w.supportedEvents.includes(eventType as any),
    );

    if (targetWebhooks.length === 0) {
      return;
    }

    this.logger.log(
      `Enqueueing event ${eventType} to ${targetWebhooks.length} webhooks`,
    );

    await Promise.all(
      targetWebhooks.map((webhook) =>
        this.webhookQueue.add(
          "deliver",
          {
            url: webhook.url,
            eventType,
            payload,
          },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId: `${eventType}-${webhook.id}-${Date.now()}`,
          },
        ),
      ),
    );
  }

  async registerWebhook(url: string, events: string[]) {
    const webhook = this.webhookRepo.create({ url, supportedEvents: events as any });
    await this.webhookRepo.save(webhook);
  }
}
