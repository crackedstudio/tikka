import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import {
  WebhookDeadLetterEntity,
  WebhookDlqReason,
} from "../database/entities/webhook-dead-letter.entity";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { DEFAULT_JOB_OPTIONS } from "../processors/queue-options";

const WEBHOOK_QUEUE = "webhook";

export interface WebhookDlqReplayResult {
  replayed: number;
  failed: number;
  skipped: number;
}

@Injectable()
export class WebhookDeadLetterService {
  private readonly logger = new Logger(WebhookDeadLetterService.name);

  constructor(
    @InjectRepository(WebhookDeadLetterEntity)
    private readonly repo: Repository<WebhookDeadLetterEntity>,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue,
  ) {}

  async record(
    webhookUrl: string,
    eventType: string,
    payload: Record<string, any>,
    errorResponse: string,
    reason: WebhookDlqReason = WebhookDlqReason.HTTP_ERROR,
    retryCount: number = 0,
  ): Promise<WebhookDeadLetterEntity> {
    const entity = this.repo.create({
      webhookUrl,
      eventType,
      payload,
      errorResponse,
      reason,
      retryCount,
      retryable: true,
      status: "pending",
    });
    const saved = await this.repo.save(entity);
    this.logger.warn(
      `Webhook DLQ: stored ${eventType} -> ${webhookUrl} (reason=${reason})`,
    );
    return saved;
  }

  async listPending(): Promise<WebhookDeadLetterEntity[]> {
    return this.repo.find({
      where: { status: "pending", retryable: true, replayedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  async listAll(): Promise<WebhookDeadLetterEntity[]> {
    return this.repo.find({ order: { createdAt: "DESC" } });
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  async replay(id: string): Promise<boolean> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) {
      this.logger.warn(`Webhook DLQ entry ${id} not found`);
      return false;
    }
    if (!entry.retryable) {
      this.logger.warn(`Webhook DLQ entry ${id} is not retryable`);
      return false;
    }
    await this.webhookQueue.add(
      "deliver",
      {
        url: entry.webhookUrl,
        eventType: entry.eventType,
        payload: entry.payload,
      },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `dlq-replay-${entry.id}-${Date.now()}`,
      },
    );
    entry.replayedAt = new Date();
    entry.status = "replayed";
    await this.repo.save(entry);
    this.logger.log(`Webhook DLQ: replayed ${entry.id} (${entry.eventType})`);
    return true;
  }

  async replayAll(): Promise<WebhookDlqReplayResult> {
    const entries = await this.listPending();
    let replayed = 0;
    let failed = 0;
    for (const entry of entries) {
      try {
        const ok = await this.replay(entry.id);
        if (ok) replayed++;
        else failed++;
      } catch (err) {
        this.logger.error(
          `Webhook DLQ: replay failed for ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        failed++;
      }
    }
    return { replayed, failed, skipped: entries.length - replayed - failed };
  }
}
