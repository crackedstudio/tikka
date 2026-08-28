import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../services/storage/supabase.provider';
import * as crypto from 'crypto';
import {
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_BACKOFF_STRATEGY,
  WEBHOOK_MAX_ATTEMPTS,
  WebhookDeliveryJobData,
} from './webhook-delivery.constants';

const WEBHOOK_DELIVERIES_TABLE = 'webhook_deliveries';
const WEBHOOK_DEAD_LETTERS_TABLE = 'webhook_dead_letters';
const WEBHOOKS_TABLE = 'webhooks';
const MAX_FAILURES = 5;

@Processor(WEBHOOK_DELIVERY_QUEUE, {
  settings: {
    backoffStrategy: WEBHOOK_BACKOFF_STRATEGY,
  },
})
@Injectable()
export class WebhookDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { targetUrl, secret, eventType, payload } = job.data;

    const payloadString = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let success = false;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tikka-Signature': signature,
          'User-Agent': 'Tikka-Webhook-Dispatcher/1.0',
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000),
      });

      statusCode = response.status;
      const text = await response.text();
      responseBody = text ? text.substring(0, 1000) : null;

      if (response.ok) {
        success = true;
      } else {
        errorMessage = `HTTP ${statusCode}`;
      }
    } catch (err: any) {
      errorMessage = err.message || 'Network error';
      if (err.name === 'TimeoutError') {
        errorMessage = 'Request timed out';
      }
    }

    await this.logDelivery(job, statusCode, responseBody, errorMessage, success);

    if (success) {
      await this.resetFailureCount(job.data.webhookId);
    } else {
      await this.incrementFailureCount(job.data.webhookId);
      throw new Error(errorMessage ?? 'Webhook delivery failed');
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<WebhookDeliveryJobData>, error: Error): Promise<void> {
    if (job.attemptsMade < (job.opts.attempts ?? WEBHOOK_MAX_ATTEMPTS)) {
      return;
    }

    this.logger.warn(
      `Webhook ${job.data.webhookId} permanently failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    try {
      await this.client.from(WEBHOOK_DEAD_LETTERS_TABLE).insert({
        webhook_id: job.data.webhookId,
        target_url: job.data.targetUrl,
        event_type: job.data.eventType,
        payload: job.data.payload,
        error_message: error.message,
        attempts_count: job.attemptsMade,
        last_attempt_at: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(
        `Failed to record dead letter for webhook ${job.data.webhookId}`,
        err,
      );
    }
  }

  private async logDelivery(
    job: Job<WebhookDeliveryJobData>,
    statusCode: number | null,
    responseBody: string | null,
    errorMessage: string | null,
    success: boolean,
  ): Promise<void> {
    try {
      await this.client.from(WEBHOOK_DELIVERIES_TABLE).insert({
        webhook_id: job.data.webhookId,
        event_type: job.data.eventType,
        payload: job.data.payload,
        status_code: statusCode,
        response_body: responseBody,
        error_message: errorMessage,
        success,
      });
    } catch (err) {
      this.logger.error(
        `Failed to log delivery for webhook ${job.data.webhookId}`,
        err,
      );
    }
  }

  private async resetFailureCount(webhookId: string): Promise<void> {
    try {
      await this.client
        .from(WEBHOOKS_TABLE)
        .update({ failure_count: 0 })
        .eq('id', webhookId);
    } catch (err) {
      this.logger.error(
        `Failed to reset failure count for webhook ${webhookId}`,
        err,
      );
    }
  }

  private async incrementFailureCount(webhookId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc(
        'increment_webhook_failure_count',
        {
          p_webhook_id: webhookId,
          p_max_failures: MAX_FAILURES,
        },
      );

      if (error) {
        this.logger.error(
          `Failed to increment failure count for webhook ${webhookId}: ${error.message}`,
          error,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to increment failure count for webhook ${webhookId}`,
        err,
      );
    }
  }
}
