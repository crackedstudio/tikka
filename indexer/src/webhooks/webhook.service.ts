import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { TracingService } from "../tracing/tracing.service";

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
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    @Optional() private readonly tracing?: TracingService,
  ) {}

  /** Alias used by some processor tests / callers. */
  async dispatchEvent(eventType: string, payload: Record<string, any>) {
    return this.dispatch(eventType, payload);
  }

  async dispatch(eventType: string, payload: Record<string, any>) {
    const run = async () => {
      const webhooks = await this.webhookRepo.find({
        where: {
          isActive: true,
        },
      });

      const targetWebhooks = webhooks.filter((w) =>
        w.supportedEvents.includes(eventType),
      );

      if (targetWebhooks.length === 0) {
        return;
      }

      this.logger.log(
        `Fanning out event ${eventType} to ${targetWebhooks.length} webhooks`,
      );

      const webhookPayload: WebhookPayload = { eventType, data: payload };

      await Promise.all(
        targetWebhooks.map((webhook) =>
          this.deliverWithRetry(webhook.url, webhookPayload),
        ),
      );
    };

    if (!this.tracing?.withSpan) {
      return run();
    }

    return this.tracing.withSpan(
      "indexer.event.webhook",
      {
        "event.type": eventType,
        ...(payload?.raffleId != null
          ? { "raffle.id": Number(payload.raffleId) }
          : {}),
      },
      async () => run(),
    );
  }

  private async deliverWithRetry(
    url: string,
    payload: WebhookPayload,
    maxAttempts = 3,
  ): Promise<void> {
    const deliver = async () => {
      let attempt = 0;
      let success = false;
      let errorResponse: string | null = null;

      while (attempt < maxAttempts && !success) {
        attempt++;
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok) {
            success = true;
          } else {
            errorResponse = `HTTP Error: ${response.status} ${response.statusText}`;
            if (attempt < maxAttempts) {
              await this.sleep(Math.pow(2, attempt) * 1000);
            }
          }
        } catch (error: any) {
          errorResponse = error.message || "Network Error";
          if (attempt < maxAttempts) {
            await this.sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }

      try {
        const delivery = this.deliveryRepo.create({
          webhookUrl: url,
          eventType: payload.eventType,
          payload,
          status: success ? "success" : "failed",
          attempts: attempt,
          errorResponse: success ? null : errorResponse,
        });
        await this.deliveryRepo.save(delivery);

        if (!success) {
          this.logger.warn(
            `Failed to deliver webhook to ${url} after ${attempt} attempts. Error: ${errorResponse}`,
          );
        }
      } catch (dbError) {
        this.logger.error(`Failed to record webhook delivery to ${url}:`, dbError);
      }
    };

    if (!this.tracing?.withSpan) {
      return deliver();
    }

    return this.tracing.withSpan(
      "indexer.event.webhook.deliver",
      {
        "event.type": payload.eventType,
        "http.url": url,
        "http.method": "POST",
      },
      async () => deliver(),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async registerWebhook(url: string, events: string[]) {
    const webhook = this.webhookRepo.create({ url, supportedEvents: events });
    await this.webhookRepo.save(webhook);
  }
}
