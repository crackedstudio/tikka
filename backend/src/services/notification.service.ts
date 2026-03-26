import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';

/** Notification subscription record */
export interface NotificationSubscription {
  id: string;
  raffle_id: number;
  user_address: string;
  channel: string;
  created_at: string;
}

/** Payload for creating a subscription */
export interface CreateSubscriptionPayload {
  raffleId: number;
  userAddress: string;
  channel?: 'email' | 'push';
}

const TABLE = 'notifications';

@Injectable()
export class NotificationService {
  private readonly client: SupabaseClient;

  constructor() {
    const { url, serviceRoleKey } = env.supabase;
    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment',
      );
    }
    this.client = createClient(url, serviceRoleKey);
  }

  /**
   * Subscribe user to raffle notifications
   * Returns existing subscription if already subscribed
   */
  async subscribe(payload: CreateSubscriptionPayload): Promise<NotificationSubscription> {
    const { raffleId, userAddress, channel = 'email' } = payload;

    // Check if subscription already exists
    const existing = await this.getSubscription(raffleId, userAddress);
    if (existing) {
      return existing;
    }

    const row = {
      raffle_id: raffleId,
      user_address: userAddress,
      channel,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from(TABLE)
      .insert(row)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        throw new ConflictException('Already subscribed to this raffle');
      }
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    return data as NotificationSubscription;
  }

  /**
   * Unsubscribe user from raffle notifications
   */
  async unsubscribe(raffleId: number, userAddress: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq('raffle_id', raffleId)
      .eq('user_address', userAddress);

    if (error) {
      throw new Error(`Failed to delete subscription: ${error.message}`);
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userAddress: string): Promise<NotificationSubscription[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('user_address', userAddress)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch user subscriptions: ${error.message}`);
    }

    return (data as NotificationSubscription[]) || [];
  }

  /**
   * Get a specific subscription
   */
  async getSubscription(
    raffleId: number,
    userAddress: string,
  ): Promise<NotificationSubscription | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('raffle_id', raffleId)
      .eq('user_address', userAddress)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }

    return data as NotificationSubscription | null;
  }

  /**
   * Get all subscribers for a raffle
   * Used by notification delivery system
   */
  async getRaffleSubscribers(raffleId: number): Promise<NotificationSubscription[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('raffle_id', raffleId);

    if (error) {
      throw new Error(`Failed to fetch raffle subscribers: ${error.message}`);
    }

    return (data as NotificationSubscription[]) || [];
  }

  /**
   * Check if user is subscribed to a raffle
   */
  async isSubscribed(raffleId: number, userAddress: string): Promise<boolean> {
    const subscription = await this.getSubscription(raffleId, userAddress);
    return subscription !== null;
  }
}
