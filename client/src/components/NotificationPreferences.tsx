/**
 * NotificationPreferences Component
 *
 * Displays and manages user's notification subscriptions
 * Shows all active subscriptions with ability to unsubscribe
 */

import { useEffect, useState } from 'react';
import { Bell, Trash2, AlertCircle } from 'lucide-react';
import { getUserSubscriptions, unsubscribeFromRaffle, type UserSubscription } from '../services/notificationService';
import { useAuthContext } from '../providers/AuthProvider';

export default function NotificationPreferences() {
  const { isAuthenticated } = useAuthContext();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadSubscriptions();
    } else {
      setSubscriptions([]);
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const loadSubscriptions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const subs = await getUserSubscriptions();
      setSubscriptions(subs);
    } catch (err) {
      console.error('Error loading subscriptions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async (raffleId: number, subscriptionId: string) => {
    try {
      setRemovingId(subscriptionId);
      await unsubscribeFromRaffle(raffleId);
      setSubscriptions(prev => prev.filter(sub => sub.id !== subscriptionId));
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    } finally {
      setRemovingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-[#11172E] rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-white">Notification Preferences</h2>
        </div>
        <p className="text-gray-400">Please sign in to manage your notification preferences.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-[#11172E] rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-white">Notification Preferences</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#11172E] rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-purple-500" />
        <h2 className="text-2xl font-bold text-white">Notification Preferences</h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-300 text-xs underline hover:no-underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">Active Subscriptions</h3>
        <p className="text-gray-400 text-sm">
          You'll receive notifications when these raffles end or when you win.
        </p>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No active subscriptions</p>
          <p className="text-gray-500 text-sm">
            Subscribe to raffles to receive notifications when they end or when you win.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className="bg-[#1A2238] rounded-xl p-4 flex items-center justify-between hover:bg-[#1F2847] transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-white font-medium">Raffle #{subscription.raffleId}</p>
                    <p className="text-gray-400 text-sm">
                      Channel: {subscription.channel} • Subscribed on{' '}
                      {new Date(subscription.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleUnsubscribe(subscription.raffleId, subscription.id)}
                disabled={removingId === subscription.id}
                className="ml-4 p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Unsubscribe"
              >
                {removingId === subscription.id ? (
                  <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-blue-300 text-sm">
          <strong>Note:</strong> Notifications are sent when a raffle ends or when you win. Make sure to check your email
          and enable push notifications in your browser settings.
        </p>
      </div>
    </div>
  );
}
