import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookDeliveryEntity, DeliveryStatus } from "./webhook-delivery.entity";
import { WebhookEntity } from "../database/entities/webhook.entity";
import * as crypto from "crypto";

interface WebhookJob {
  deliveryId: string;
}

@Processor("webhook", {
  concurrency: 10,
})
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private deliveryRepo: Repository<WebhookDeliveryEntity>,
    @InjectRepository(WebhookEntity)
    private webhookRepo: Repository<WebhookEntity>,
  ) {
    super();
  }

  async process(job: Job<WebhookJob>): Promise<void> {
    const { deliveryId } = job.data;

    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
      relations: ["webhook"],
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${deliveryId} not found, skipping`);
      return;
    }

    // Check if already delivered or permanently failed
    if (
      delivery.status === DeliveryStatus.SUCCESS ||
      delivery.status === DeliveryStatus.PERMANENT_FAILURE
    ) {
      this.logger.debug(
        `Delivery ${deliveryId} already in terminal state: ${delivery.status}`,
      );
      return;
    }

    // Update state to sending
    delivery.status = DeliveryStatus.SENDING;
    delivery.attemptCount += 1;
    delivery.lastAttemptAt = new Date();
    await this.deliveryRepo.save(delivery);

    try {
      await this.sendWebhook(delivery);

      // Success
      delivery.status = DeliveryStatus.SUCCESS;
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = null;
      await this.deliveryRepo.save(delivery);

      this.logger.log(
        `Successfully delivered webhook ${deliveryId} to ${delivery.webhook.url}`,
      );
    } catch (error: any) {
      delivery.lastError = error.message;
      delivery.lastStatusCode = error.statusCode;

      // Determine if we should retry
      if (delivery.attemptCount >= delivery.maxAttempts) {
        delivery.status = DeliveryStatus.PERMANENT_FAILURE;
        delivery.nextRetryAt = null;

        // Update webhook failure count
        delivery.webhook.failureCount += 1;
        delivery.webhook.lastFailureAt = new Date();
        await this.webhookRepo.save(delivery.webhook);

        this.logger.error(
          `Permanent failure for delivery ${deliveryId} after ${delivery.attemptCount} attempts`,
        );
      } else {
        delivery.status = DeliveryStatus.FAILED;
        delivery.nextRetryAt = this.calculateNextRetry(delivery.attemptCount);

        this.logger.warn(
          `Delivery ${deliveryId} failed (attempt ${delivery.attemptCount}/${delivery.maxAttempts}), retry at ${delivery.nextRetryAt}`,
        );

        // Re-queue for retry
        throw error; // Let BullMQ handle retry scheduling
      }

      await this.deliveryRepo.save(delivery);
    }
  }

  private async sendWebhook(delivery: WebhookDeliveryEntity): Promise<void> {
    const payload = {
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      timestamp: delivery.createdAt.toISOString(),
      data: delivery.payload,
    };

    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, delivery.webhook.signingSecret);

    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Event-Id": delivery.eventId,
        "X-Event-Type": delivery.eventType,
        "User-Agent": "Tikka-Indexer-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      const error: any = new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );
      error.statusCode = response.status;
      throw error;
    }
  }

  private signPayload(payload: string, secret?: string): string {
    if (!secret) {
      return "";
    }
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  private calculateNextRetry(attemptCount: number): Date {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delayMs = Math.min(1000 * Math.pow(2, attemptCount - 1), 16000);
    return new Date(Date.now() + delayMs);
  }
}
