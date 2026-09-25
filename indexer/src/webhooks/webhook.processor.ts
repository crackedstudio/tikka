import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterService } from "./webhook-dlq.service";
import { WebhookDlqReason } from "../database/entities/webhook-dead-letter.entity";

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

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, data: payload }),
        signal: AbortSignal.timeout(5000),
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

  private classifyError(message: string): WebhookDlqReason {
    const lower = message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("abort")) {
      return WebhookDlqReason.TIMEOUT;
    }
    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("unreachable")) {
      return WebhookDlqReason.UNREACHABLE;
    }
    if (lower.includes("network") || lower.includes("econnreset") || lower.includes("econnaborted")) {
      return WebhookDlqReason.NETWORK_ERROR;
    }
    return WebhookDlqReason.HTTP_ERROR;
  }
}
