import { Inject, Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import * as crypto from 'crypto';

export interface Webhook {
  id: string;
  owner_address: string;
  target_url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  failure_count: number;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: any;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  success: boolean;
  created_at: string;
}

export interface CreateWebhookPayload {
  ownerAddress: string;
  targetUrl: string;
  events: string[];
}

export interface UpdateWebhookPayload {
  targetUrl?: string;
  events?: string[];
  isActive?: boolean;
}

const TABLE = 'webhooks';
const DELIVERIES_TABLE = 'webhook_deliveries';
const MAX_FAILURES = 5;
const MAX_RETRIES = 3;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {}

  /**
   * Create a new webhook subscription
   */
  async createWebhook(payload: CreateWebhookPayload): Promise<Webhook> {
    const secret = crypto.randomBytes(32).toString('hex');
    
    const row = {
      owner_address: payload.ownerAddress,
      target_url: payload.targetUrl,
      events: payload.events,
      secret,
    };

    const { data, error } = await this.client
      .from(TABLE)
      .insert(row)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Webhook already exists for this URL');
      }
      throw new Error(`Failed to create webhook: ${error.message}`);
    }

    return data as Webhook;
  }

  /**
   * Get all webhooks for an owner
   */
  async getWebhooksByOwner(ownerAddress: string): Promise<Webhook[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('owner_address', ownerAddress)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch webhooks: ${error.message}`);
    }

    return (data as Webhook[]) || [];
  }

  /**
   * Get a single webhook
   */
  async getWebhook(id: string, ownerAddress: string): Promise<Webhook> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('owner_address', ownerAddress)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Webhook not found');
    }

    return data as Webhook;
  }

  /**
   * Update a webhook
   */
  async updateWebhook(id: string, ownerAddress: string, payload: UpdateWebhookPayload): Promise<Webhook> {
    // Verify ownership
    await this.getWebhook(id, ownerAddress);

    const updateData: any = {};
    if (payload.targetUrl !== undefined) updateData.target_url = payload.targetUrl;
    if (payload.events !== undefined) updateData.events = payload.events;
    if (payload.isActive !== undefined) updateData.is_active = payload.isActive;

    const { data, error } = await this.client
      .from(TABLE)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update webhook: ${error.message}`);
    }

    return data as Webhook;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id: string, ownerAddress: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_address', ownerAddress);

    if (error) {
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }
  }

  /**
   * Get delivery logs for a webhook
   */
  async getDeliveries(webhookId: string, ownerAddress: string): Promise<WebhookDelivery[]> {
    // Verify ownership
    await this.getWebhook(webhookId, ownerAddress);

    const { data, error } = await this.client
      .from(DELIVERIES_TABLE)
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch webhook deliveries: ${error.message}`);
    }

    return (data as WebhookDelivery[]) || [];
  }

  /**
   * Main entry point to trigger webhooks for a specific event
   */
  async triggerWebhooks(eventType: string, payloadData: any): Promise<void> {
    // Find all active webhooks that subscribe to this event
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .contains('events', [eventType]);

    if (error) {
      this.logger.error(`Failed to query webhooks for event ${eventType}`, error);
      return;
    }

    const webhooks = (data as Webhook[]) || [];
    if (webhooks.length === 0) {
      return; // No webhooks to trigger
    }

    const payloadObj = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payloadData,
    };
    
    const payloadString = JSON.stringify(payloadObj);

    // Process all webhooks concurrently
    await Promise.allSettled(
      webhooks.map((webhook) => this.deliverWebhookWithRetries(webhook, eventType, payloadString))
    );
  }

  /**
   * Delivers a webhook with exponential backoff retries
   */
  private async deliverWebhookWithRetries(webhook: Webhook, eventType: string, payloadString: string): Promise<void> {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(payloadString)
      .digest('hex');

    let attempt = 0;
    let success = false;
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;

    while (attempt <= MAX_RETRIES && !success) {
      if (attempt > 0) {
        // Exponential backoff: 2s, 4s, 8s
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((res) => setTimeout(res, delayMs));
      }

      try {
        const response = await fetch(webhook.target_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tikka-Signature': signature,
            'User-Agent': 'Tikka-Webhook-Dispatcher/1.0',
          },
          body: payloadString,
          // Set a reasonable timeout (fetch doesn't have native timeout, assuming standard node usage)
          signal: AbortSignal.timeout(10000)
        });

        statusCode = response.status;
        const text = await response.text();
        responseBody = text ? text.substring(0, 1000) : null; // Limit response body size

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

      attempt++;
    }

    // Log the delivery attempt in Supabase
    await this.logDelivery(webhook.id, eventType, JSON.parse(payloadString), statusCode, responseBody, errorMessage, success);

    if (success) {
      // If previously failing, reset failure count
      if (webhook.failure_count > 0) {
        await this.client.from(TABLE).update({ failure_count: 0 }).eq('id', webhook.id);
      }
    } else {
      // RACE CONDITION FIX (original lines 260-277):
      // The original code was vulnerable to concurrent delivery failures:
      //   Delivery A: reads failure_count = N → computes N+1 → writes N+1
      //   Delivery B: reads failure_count = N → computes N+1 → writes N+1
      // Both write the same value N+1, so the count only increments by 1 instead of 2.
      // If N+1 < MAX_FAILURES but N+2 >= MAX_FAILURES, the webhook is never disabled.
      //
      // FIX: Use atomic server-side increment via increment_webhook_failure_count()
      // This single database operation:
      //   1. Increments failure_count at the server (failure_count = failure_count + 1)
      //   2. Conditionally disables in the same statement (CASE WHEN ...)
      //   3. Returns the post-increment values in one round-trip
      // All concurrent requests now correctly read the post-increment value and
      // the webhook is disabled exactly at the right threshold.
      
      const { data, error } = await this.client.rpc('increment_webhook_failure_count', {
        p_webhook_id: webhook.id,
        p_max_failures: MAX_FAILURES,
      });

      if (error) {
        this.logger.error(
          `Failed to increment failure count for webhook ${webhook.id}: ${error.message}`,
          error
        );
        return;
      }

      if (data && data.length > 0) {
        // Use post-increment values from RPC for logging — do not re-read the row;
        // a re-read races with other concurrent updates
        const result = data[0];
        const { failure_count: postIncrementCount, is_active: isActive } = result;

        if (!isActive) {
          this.logger.warn(
            `Disabled webhook ${webhook.id} due to ${postIncrementCount} consecutive failures.`
          );
        } else {
          this.logger.debug(
            `Incremented failure count for webhook ${webhook.id} to ${postIncrementCount}.`
          );
        }
      }
    }
  }

  private async logDelivery(
    webhookId: string, 
    eventType: string, 
    payload: any, 
    statusCode: number | null, 
    responseBody: string | null, 
    errorMessage: string | null, 
    success: boolean
  ) {
    try {
      await this.client.from(DELIVERIES_TABLE).insert({
        webhook_id: webhookId,
        event_type: eventType,
        payload,
        status_code: statusCode,
        response_body: responseBody,
        error_message: errorMessage,
        success,
      });
    } catch (err) {
      this.logger.error(`Failed to log delivery for webhook ${webhookId}`, err);
    }
  }
}
