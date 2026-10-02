import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookDlqReason } from "../database/entities/webhook-dead-letter.entity";
import { getRequestIdHeaders } from "../common/request-context";
import {
  DELIVERY_TIMEOUT_MS,
  classifyDeliveryFailure,
} from "./webhook-delivery-policy";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_SECRET_ENV,
  buildWebhookHeaders,
  resolveWebhookSignatureSecret,
} from "./webhook-signature";

const WEBHOOK_QUEUE = "webhook";

export interface WebhookDeliveryJob {
  url: string;
  eventType: string;
  payload: Record<string, any>;
}

@Processor(WEBHOOK_QUEUE)
@Injectable()
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    private readonly dlqService: WebhookDeadLetterService,
  ) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { url, eventType, payload } = job.data;
    let errorResponse: string | null = null;

    // BullMQ calls `process` once per attempt, but all of those attempts are
    // one logical delivery — so the id comes from the job, which is stable
    // across them, and only falls back to a fresh uuid for a job without one.
    // A per-call id would look like a brand new event to a subscriber that
    // already processed an attempt whose response we never saw.
    const deliveryId = job.id ? String(job.id) : randomUUID();

    // Serialize once and sign these exact bytes — the consumer verifies the
    // raw body, so signing a different serialization would not match.
    const rawBody = JSON.stringify({ eventType, data: payload });

    const secret = resolveWebhookSignatureSecret();
    if (!secret) {
      this.logger.warn(
        `${WEBHOOK_SIGNATURE_SECRET_ENV} is not set — delivering to ${url} unsigned. ` +
          `Any consumer that verifies ${WEBHOOK_SIGNATURE_HEADER} will reject it.`,
      );
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...buildWebhookHeaders({ secret, rawBody, deliveryId }),
          ...getRequestIdHeaders(),
        },
        body: rawBody,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      if (response.ok) {
        await this.recordDelivery(url, eventType, payload, "success", job.attemptsMade + 1, null);
        return;
      }
      errorResponse = `HTTP Error: ${response.status} ${response.statusText}`;
    } catch (error: any) {
      errorResponse = error.message || "Network Error";
    }

    await this.recordDelivery(url, eventType, payload, "failed", job.attemptsMade + 1, errorResponse);
    this.logger.warn(`Webhook delivery failed to ${url}: ${errorResponse}`);
    throw new Error(errorResponse ?? "Webhook delivery failed");
  }

  private async recordDelivery(
    url: string,
    eventType: string,
    payload: Record<string, any>,
    status: "success" | "failed",
    attempts: number,
    errorResponse: string | null,
  ): Promise<void> {
    await this.deliveryRepo.save(
      this.deliveryRepo.create({
        webhookUrl: url,
        eventType,
        payload,
        status,
        attempts,
        errorResponse: errorResponse ?? null,
      }),
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<WebhookDeliveryJob>, error: Error): Promise<void> {
    this.logger.error(
      `Webhook delivery exhausted for ${job.data.url}: ${error.message}`,
    );
    const reason = this.classifyError(error.message);
    await this.dlqService.record(
      job.data.url,
      job.data.eventType,
      job.data.payload,
      error.message,
      reason,
      job.attemptsMade,
    );
  }

  /**
   * Delegates to the shared delivery policy so the queue path and the direct
   * path cannot classify the same failure differently.
   */
  private classifyError(message: string): WebhookDlqReason {
    return classifyDeliveryFailure({ error: new Error(message) }).reason;
  }
}
