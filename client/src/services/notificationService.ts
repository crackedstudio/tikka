/**
 * Notification Service
 *
 * Handles notification subscription management for raffle alerts
 * Users can subscribe to be notified when a raffle ends or when they win
 */

import { api } from './apiClient';
import { API_CONFIG } from '../config/api';

export type NotificationChannel = 'email' | 'push';

export interface SubscribeRequest {
  raffleId: number;
  channel?: NotificationChannel;
}

export interface SubscriptionResponse {
  id: string;
  raffleId: number;
  userAddress: string;
  channel: NotificationChannel;
  createdAt: string;
}

export interface UserSubscription {
  id: string;
  raffleId: number;
  channel: NotificationChannel;
  createdAt: string;
}

/**
 * Subscribe to notifications for a specific raffle
 * Requires authentication
 */
export async function subscribeToRaffle(
  request: SubscribeRequest
): Promise<SubscriptionResponse> {
  return api.post<SubscriptionResponse>(
    API_CONFIG.endpoints.notifications.subscribe,
    request,
    { requiresAuth: true }
  );
}

/**
 * Unsubscribe from notifications for a specific raffle
 * Requires authentication
 */
export async function unsubscribeFromRaffle(
  raffleId: number
): Promise<void> {
  return api.delete(
    API_CONFIG.endpoints.notifications.unsubscribe(raffleId.toString()),
    { requiresAuth: true }
  );
}

/**
 * Get all active subscriptions for the authenticated user
 * Requires authentication
 */
export async function getUserSubscriptions(): Promise<UserSubscription[]> {
  return api.get<UserSubscription[]>(
    API_CONFIG.endpoints.notifications.list,
    { requiresAuth: true }
  );
}

/**
 * Check if user is subscribed to a specific raffle
 */
export async function isSubscribedToRaffle(
  raffleId: number
): Promise<boolean> {
  try {
    const subscriptions = await getUserSubscriptions();
    return subscriptions.some(sub => sub.raffleId === raffleId);
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}
