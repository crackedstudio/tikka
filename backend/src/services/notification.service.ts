import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';

/** Notification subscription record */
export interface NotificationSubscription {
  id: string;
  raffle_id: number;
  user_address: string;
  channel: string;
  created_at: string;
  status?: string; // 'active' | 'revoked'
}

/** Payload for creating a subscription */
export interface CreateSubscriptionPayload {
  raffleId: number;
  userAddress: string;
  channel?: 'email' | 'push';
}

/** User notification preferences */
export interface NotificationPreferences {
  user_address: string;
  raffle_end: boolean;
  win_notification: boolean;
  channel: 'email' | 'push';
  created_at: string;
  updated_at: string;
}

/** Payload for updating preferences */
export interface UpdatePreferencesPayload {
  raffleEnd?: boolean;
  winNotification?: boolean;
  channel?: 'email' | 'push';
}

const TABLE = 'notifications';
const PREFERENCES_TABLE = 'notification_preferences';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {}

  /**
   * Subscribe user to raffle notifications
   * Returns existing active subscription if already subscribed
   */
  async subscribe(payload: CreateSubscriptionPayload): Promise<NotificationSubscription> {
    const { raffleId, userAddress, channel = 'email' } = payload;

    // Check if subscription already exists and is active
    const existing = await this.getSubscription(raffleId, userAddress);
    if (existing && existing.status !== 'revoked') {
      return existing;
    }

    const row = {
      raffle_id: raffleId,
      user_address: userAddress,
      channel,
      created_at: new Date().toISOString(),
      status: 'active',
    };

    const { data, error } = await this.client.from(TABLE).insert(row).select().single();

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
   * Unsubscribe (mark revoked)
   */
  async unsubscribe(raffleId: number, userAddress: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .update({ status: 'revoked' })
      .eq('raffle_id', raffleId)
      .eq('user_address', userAddress);

    if (error) {
      throw new Error(`Failed to revoke subscription: ${error.message}`);
    }
  }

  /**
   * Update a subscription (e.g., channel)
   */
  async updateSubscription(id: string, dto: { channel?: string }): Promise<void> {
    const updates: Record<string, any> = {};
    if (dto.channel) updates.channel = dto.channel;
    if (Object.keys(updates).length === 0) return;

    const { error } = await this.client
      .from(TABLE)
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update subscription: ${error.message}`);
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
    return subscription !== null && subscription.status !== 'revoked';
  }

  /**
   * Get user notification preferences
   * Returns default preferences if not set
   */
  async getPreferences(userAddress: string): Promise<NotificationPreferences> {
    const { data, error } = await this.client
      .from(PREFERENCES_TABLE)
      .select('*')
      .eq('user_address', userAddress)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch preferences: ${error.message}`);
    }

    // Return defaults if not set
    if (!data) {
      return {
        user_address: userAddress,
        raffle_end: true,
        win_notification: true,
        channel: 'email',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return data as NotificationPreferences;
  }

  /**
   * Update user notification preferences
   * Creates preferences row if it doesn't exist
   */
  async updatePreferences(
    userAddress: string,
    payload: UpdatePreferencesPayload,
  ): Promise<NotificationPreferences> {
    const updates: Record<string, any> = {
      user_address: userAddress,
      updated_at: new Date().toISOString(),
    };

    if (payload.raffleEnd !== undefined) updates.raffle_end = payload.raffleEnd;
    if (payload.winNotification !== undefined) updates.win_notification = payload.winNotification;
    if (payload.channel !== undefined) updates.channel = payload.channel;

    const { data, error } = await this.client
      .from(PREFERENCES_TABLE)
      .upsert(updates, { onConflict: 'user_address' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    return data as NotificationPreferences;
  }

  /**
   * Check if user has opted in for raffle end notifications
   */
  async canSendRaffleEnd(userAddress: string): Promise<boolean> {
    const prefs = await this.getPreferences(userAddress);
    return prefs.raffle_end;
  }

  /**
   * Check if user has opted in for win notifications
   */
  async canSendWinner(userAddress: string): Promise<boolean> {
    const prefs = await this.getPreferences(userAddress);
    return prefs.win_notification;
  }

  /**
   * Get raffle subscribers filtered by raffle end preferences
   */
  async getRaffleEndSubscribers(raffleId: number): Promise<NotificationSubscription[]> {
    const allSubscribers = await this.getRaffleSubscribers(raffleId);
    
    // Filter by user preferences
    const filtered = await Promise.all(
      allSubscribers.map(async (sub) => {
        const canSend = await this.canSendRaffleEnd(sub.user_address);
        return canSend ? sub : null;
      })
    );

    return filtered.filter((sub): sub is NotificationSubscription => sub !== null);
  }

  /**
   * Get winner subscribers filtered by win notification preferences
   */
  async getWinnerSubscribers(raffleId: number): Promise<NotificationSubscription[]> {
    const allSubscribers = await this.getRaffleSubscribers(raffleId);
    
    // Filter by user preferences
    const filtered = await Promise.all(
      allSubscribers.map(async (sub) => {
        const canSend = await this.canSendWinner(sub.user_address);
        return canSend ? sub : null;
      })
    );

    return filtered.filter((sub): sub is NotificationSubscription => sub !== null);
  }
}
