/**
 * useNotifications Hook
 *
 * Custom hook for managing notification subscriptions
 * Provides methods to subscribe, unsubscribe, and check subscription status
 */

import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToRaffle,
  unsubscribeFromRaffle,
  getUserSubscriptions,
  type NotificationChannel,
} from '../services/notificationService';
import { useAuthContext } from '../providers/AuthProvider';

export interface UseNotificationsReturn {
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: (raffleId: number, channel?: NotificationChannel) => Promise<void>;
  unsubscribe: (raffleId: number) => Promise<void>;
  checkSubscription: (raffleId: number) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook to manage notification subscriptions for raffles
 */
export function useNotifications(raffleId?: number): UseNotificationsReturn {
  const { isAuthenticated } = useAuthContext();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if user is subscribed to the raffle
   */
  const checkSubscription = useCallback(async (id: number) => {
    if (!isAuthenticated) {
      setIsSubscribed(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const subscriptions = await getUserSubscriptions();
      const subscribed = subscriptions.some(sub => sub.raffleId === id);
      setIsSubscribed(subscribed);
    } catch (err) {
      console.error('Error checking subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to check subscription');
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Subscribe to raffle notifications
   */
  const subscribe = useCallback(async (id: number, channel: NotificationChannel = 'email') => {
    if (!isAuthenticated) {
      setError('Please sign in to subscribe to notifications');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await subscribeToRaffle({ raffleId: id, channel });
      setIsSubscribed(true);
    } catch (err) {
      console.error('Error subscribing:', err);
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Unsubscribe from raffle notifications
   */
  const unsubscribe = useCallback(async (id: number) => {
    if (!isAuthenticated) {
      setError('Please sign in to manage subscriptions');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await unsubscribeFromRaffle(id);
      setIsSubscribed(false);
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check subscription status on mount if raffleId is provided
  useEffect(() => {
    if (raffleId && isAuthenticated) {
      checkSubscription(raffleId);
    } else {
      setIsSubscribed(false);
    }
  }, [raffleId, isAuthenticated, checkSubscription]);

  return {
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    checkSubscription,
    clearError,
  };
}
