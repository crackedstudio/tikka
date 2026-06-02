/**
 * useNotifications Hook
 *
 * Custom hook for managing notification subscriptions for a specific raffle.
 * Provides subscribe / unsubscribe actions and tracks loading / error state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useNotifications(raffleId?: number): UseNotificationsReturn {
  const { isAuthenticated } = useAuthContext();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest request so stale responses are ignored
  const requestId = useRef(0);

  const checkSubscription = useCallback(
    async (id: number) => {
      if (!isAuthenticated) {
        setIsSubscribed(false);
        return;
      }

      const current = ++requestId.current;
      try {
        setIsLoading(true);
        setError(null);
        const subscriptions = await getUserSubscriptions();
        if (current !== requestId.current) return;
        setIsSubscribed(subscriptions.some((sub) => sub.raffleId === id));
      } catch (err) {
        if (current !== requestId.current) return;
        console.error('Error checking subscription:', err);
        setError(err instanceof Error ? err.message : 'Failed to check subscription');
        setIsSubscribed(false);
      } finally {
        if (current === requestId.current) setIsLoading(false);
      }
    },
    [isAuthenticated]
  );

  const subscribe = useCallback(
    async (id: number, channel: NotificationChannel = 'email') => {
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
    },
    [isAuthenticated]
  );

  const unsubscribe = useCallback(
    async (id: number) => {
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
    },
    [isAuthenticated]
  );

  const clearError = useCallback(() => setError(null), []);

  // Check subscription status whenever raffleId or auth state changes
  useEffect(() => {
    if (raffleId && isAuthenticated) {
      checkSubscription(raffleId);
    } else {
      setIsSubscribed(false);
    }
  }, [raffleId, isAuthenticated]); // intentionally omit checkSubscription — it's stable

  return { isSubscribed, isLoading, error, subscribe, unsubscribe, checkSubscription, clearError };
}
