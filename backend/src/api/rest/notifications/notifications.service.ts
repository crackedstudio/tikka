import { Injectable } from '@nestjs/common';
import {
  NotificationService,
  CreateSubscriptionPayload,
  NotificationSubscription,
  NotificationPreferences,
  UpdatePreferencesPayload,
} from '../../../services/notification.service';
import {
  PushNotificationService,
  PushNotificationPayload,
  PushTokenRecord,
} from '../../../services/push-notification.service';
import { NotificationPreferencesResponse } from './dto/notification-preferences.dto';

/** API response format (camelCase for frontend) */
export interface SubscriptionResponse {
  id: string;
  raffleId: number;
  userAddress: string;
  channel: string;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  /**
   * Transform database record to API response format
   */
  private toResponse(sub: NotificationSubscription): SubscriptionResponse {
    return {
      id: sub.id,
      raffleId: sub.raffle_id,
      userAddress: sub.user_address,
      channel: sub.channel,
      createdAt: sub.created_at,
    };
  }

  /**
   * Subscribe user to raffle notifications
   */
  async subscribe(payload: CreateSubscriptionPayload): Promise<SubscriptionResponse> {
    const subscription = await this.notificationService.subscribe(payload);
    return this.toResponse(subscription);
  }

  /**
   * Unsubscribe user from raffle notifications
   */
  async unsubscribe(raffleId: number, userAddress: string): Promise<void> {
    await this.notificationService.unsubscribe(raffleId, userAddress);
  }

  /**
   * Update a subscription (e.g., channel)
   */
  async updateSubscription(id: string, dto: { channel?: string }): Promise<void> {
    await this.notificationService.updateSubscription(id, dto);
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userAddress: string): Promise<SubscriptionResponse[]> {
    const subscriptions = await this.notificationService.getUserSubscriptions(userAddress);
    return subscriptions.map(sub => this.toResponse(sub));
  }

  /**
   * Check if user is subscribed to a raffle
   */
  async isSubscribed(raffleId: number, userAddress: string): Promise<boolean> {
    return this.notificationService.isSubscribed(raffleId, userAddress);
  }

  /**
   * Register a device token for push notifications
   */
  async registerDeviceToken(
    userAddress: string,
    deviceToken: string,
    platform = 'fcm',
  ): Promise<PushTokenRecord> {
    return this.pushNotificationService.registerDeviceToken(userAddress, deviceToken, platform);
  }

  /**
   * Unregister a device token
   */
  async unregisterDeviceToken(userAddress: string, deviceToken: string): Promise<void> {
    return this.pushNotificationService.unregisterDeviceToken(userAddress, deviceToken);
  }

  /**
   * Deliver push notification to user
   */
  async sendPushToUser(userAddress: string, payload: PushNotificationPayload) {
    return this.pushNotificationService.sendToUser(userAddress, payload);
  }

  /**
   * Transform database preferences to API response format
   */
  private toPreferencesResponse(prefs: NotificationPreferences): NotificationPreferencesResponse {
    return {
      userAddress: prefs.user_address,
      raffleEnd: prefs.raffle_end,
      winNotification: prefs.win_notification,
      channel: prefs.channel,
      updatedAt: prefs.updated_at,
    };
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userAddress: string): Promise<NotificationPreferencesResponse> {
    const prefs = await this.notificationService.getPreferences(userAddress);
    return this.toPreferencesResponse(prefs);
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(
    userAddress: string,
    payload: UpdatePreferencesPayload,
  ): Promise<NotificationPreferencesResponse> {
    const prefs = await this.notificationService.updatePreferences(userAddress, payload);
    return this.toPreferencesResponse(prefs);
  }
}
