export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export const WEBHOOK_MAX_ATTEMPTS = 10;

export const WEBHOOK_BASE_DELAY_MS = 2000;

export const WEBHOOK_MAX_DELAY_MS = 60000;

import type { BackoffStrategy } from 'bullmq';

export const cappedExponentialBackoff: BackoffStrategy = (
  attemptsMade: number,
): number => {
  const delay = Math.min(
    WEBHOOK_MAX_DELAY_MS,
    WEBHOOK_BASE_DELAY_MS * Math.pow(2, attemptsMade),
  );
  const jitter = Math.random() * 1000;
  return Math.floor(delay + jitter);
};

export const WEBHOOK_BACKOFF_STRATEGY: BackoffStrategy = cappedExponentialBackoff;

export interface WebhookDeliveryJobData {
  webhookId: string;
  targetUrl: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  ownerAddress: string;
}

export const WEBHOOK_DELIVERY_JOB_NAME = 'deliver';
