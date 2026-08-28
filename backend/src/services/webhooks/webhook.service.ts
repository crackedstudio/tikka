import { Inject, Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../storage/supabase.provider';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import {
  WEBHOOK_DELIVERY_QUEUE,
  WebhookDeliveryJobData,
} from '../../queues/webhook-delivery.constants';

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

export interface WebhookDeadLetter {
  id: string;
  webhook_id: string;
  target_url: string;
  event_type: string;
  payload: any;
  error_message: string | null;
  attempts_count: number;
  last_attempt_at: string;
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
const DEAD_LETTERS_TABLE = 'webhook_dead_letters';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly deliveryQueue: Queue<WebhookDeliveryJobData>,
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
   * Get dead letter records for a webhook
   */
  async getDeadLetters(webhookId: string, ownerAddress: string): Promise<WebhookDeadLetter[]> {
    // Verify ownership
    await this.getWebhook(webhookId, ownerAddress);

    const { data, error } = await this.client
      .from(DEAD_LETTERS_TABLE)
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch dead letters: ${error.message}`);
    }

    return (data as WebhookDeadLetter[]) || [];
  }

  /**
   * Main entry point to trigger webhooks for a specific event
   * Enqueues a BullMQ job for each matching webhook instead of delivering synchronously.
   */
  async triggerWebhooks(eventType: string, payloadData: any): Promise<void> {
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
      return;
    }

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
          await this.deliveryQueue.add('deliver', {
            webhookId: webhook.id,
            targetUrl: webhook.target_url,
            secret: webhook.secret,
            eventType,
            payload: payloadData,
            ownerAddress: webhook.owner_address,
          });
        } catch (err) {
          this.logger.error(
            `Failed to enqueue webhook delivery for ${webhook.id}`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }),
    );
  }
}
