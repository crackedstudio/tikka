import { Injectable } from '@nestjs/common';
import {
  NotificationService,
  CreateSubscriptionPayload,
  NotificationSubscription,
} from '../../../services/notification.service';

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
  constructor(private readonly notificationService: NotificationService) {}

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
    return this.notificationService.unsubscribe(raffleId, userAddress);
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
}
