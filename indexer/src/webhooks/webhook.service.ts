import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookEntity } from "../database/entities/webhook.entity";
import {
  WebhookDeliveryEntity,
  DeliveryStatus,
} from "./webhook-delivery.entity";
import * as crypto from "crypto";

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
    @InjectRepository(WebhookDeliveryEntity)
    private deliveryRepo: Repository<WebhookDeliveryEntity>,
    @InjectQueue("webhook") private webhookQueue: Queue,
  ) {}

  /**
   * Dispatch event to all registered webhooks with idempotency.
   * Creates delivery records and queues for processing.
   */
  async dispatchEvent(payload: WebhookPayload): Promise<void> {
    const eventId = this.generateEventId(payload);

    // Check for duplicate event
    const existingDelivery = await this.deliveryRepo.findOne({
      where: { eventId },
    });

    if (existingDelivery) {
      this.logger.debug(
        `Event ${eventId} already dispatched, skipping duplicate`,
      );
      return;
    }

    const webhooks = await this.webhookRepo.find({
      where: {
        isActive: true,
        supportedEvents: payload.eventType, // TypeORM array contains check
      },
    });

    for (const webhook of webhooks) {
      const delivery = this.deliveryRepo.create({
        webhook,
        eventId,
        eventType: payload.eventType,
        payload: payload.data,
        status: DeliveryStatus.PENDING,
        attemptCount: 0,
        maxAttempts: 5,
      });

      await this.deliveryRepo.save(delivery);

      await this.webhookQueue.add(
        "send",
        { deliveryId: delivery.id },
        {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );

      this.logger.log(
        `Queued webhook delivery ${delivery.id} to ${webhook.url} for ${payload.eventType}:${payload.raffleId}`,
      );
    }
  }

  /**
   * Register a new webhook endpoint with optional signing secret.
   */
  async registerWebhook(
    url: string,
    events: ("RaffleCreated" | "RaffleFinalized")[],
    signingSecret?: string,
  ): Promise<WebhookEntity> {
    const secret = signingSecret || this.generateSigningSecret();
    const webhook = this.webhookRepo.create({
      url,
      supportedEvents: events,
      signingSecret: secret,
    });
    return await this.webhookRepo.save(webhook);
  }

  /**
   * Get delivery status for an event.
   */
  async getDeliveryStatus(eventId: string): Promise<WebhookDeliveryEntity[]> {
    return await this.deliveryRepo.find({
      where: { eventId },
      relations: ["webhook"],
    });
  }

  /**
   * Generate unique event ID for idempotency.
   */
  private generateEventId(payload: WebhookPayload): string {
    const data = `${payload.eventType}:${payload.raffleId}:${payload.timestamp.getTime()}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generate secure signing secret for webhook.
   */
  private generateSigningSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async onApplicationBootstrap() {
    // Processors will inject this service
  }
}
