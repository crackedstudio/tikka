/**
 * useUserSubscriptions Hook
 *
 * Fetches and manages all notification subscriptions for the authenticated user.
 * Provides typed loading and error states for the settings page.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getUserSubscriptions,
  unsubscribeFromRaffle,
  type UserSubscription,
} from '../../services/notificationService';
import { getApiErrorMessage } from '../../services/apiClient';
import { useAuthContext } from '../../providers';

export interface UseUserSubscriptionsReturn {
  subscriptions: UserSubscription[];
  isLoading: boolean;
  error: string | null;
  unsubscribe: (subscriptionId: string, raffleId: number) => Promise<void>;
  refetch: () => Promise<void>;
  clearError: () => void;
}

export function useUserSubscriptions(): UseUserSubscriptionsReturn {
  const { isAuthenticated } = useAuthContext();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const loadSubscriptions = useCallback(async () => {
    if (!isAuthenticated) {
      setSubscriptions([]);
      return;
    }

    const current = ++requestId.current;
    try {
      setIsLoading(true);
      setError(null);
      const subs = await getUserSubscriptions();
      if (current === requestId.current) {
        setSubscriptions(subs);
      }
    } catch (err) {
      if (current === requestId.current) {
        console.error('Error loading subscriptions:', err);
        setError(getApiErrorMessage(err, 'Failed to load subscriptions'));
      }
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [isAuthenticated]);

  const unsubscribe = useCallback(
    async (subscriptionId: string, raffleId: number) => {
      if (!isAuthenticated) return;

      const current = ++requestId.current;
      try {
        setIsLoading(true);
        setError(null);
        await unsubscribeFromRaffle(raffleId);
        if (current === requestId.current) {
          setSubscriptions((prev) => prev.filter((s) => s.id !== subscriptionId));
        }
      } catch (err) {
        if (current === requestId.current) {
          console.error('Error unsubscribing:', err);
          setError(getApiErrorMessage(err, 'Failed to unsubscribe'));
        }
      } finally {
        if (current === requestId.current) setIsLoading(false);
      }
    },
    [isAuthenticated]
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  return { subscriptions, isLoading, error, unsubscribe, refetch: loadSubscriptions, clearError };
}