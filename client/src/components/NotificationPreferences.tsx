/**
 * NotificationPreferences Component
 *
 * Displays and manages the user's active notification subscriptions.
 * Shown in the Settings page under the Notifications tab.
 */

import { useEffect, useState } from 'react';
import { Bell, Trash2, AlertCircle, ExternalLink, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getUserSubscriptions,
  unsubscribeFromRaffle,
  type UserSubscription,
} from '../services/notificationService';
import { useAuthContext } from '../providers/AuthProvider';
import NotificationEventPreferences, { type NotificationEventType } from './NotificationEventPreferences';

export default function NotificationPreferences() {
  const { isAuthenticated } = useAuthContext();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState<string | null>(null);

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

  const handleUnsubscribe = async (subscription: UserSubscription) => {
    try {
      setRemovingId(subscription.id);
      await unsubscribeFromRaffle(subscription.raffleId);
      setSubscriptions((prev) => prev.filter((s) => s.id !== subscription.id));
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    } finally {
      setRemovingId(null);
    }
  };

  const handleEventPreferencesChange = async (subscriptionId: string, events: NotificationEventType[]) => {
    try {
      setPreferencesLoading(subscriptionId);
      // TODO: Call API to update event preferences
      // await updateNotificationPreferences(subscriptionId, events);
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === subscriptionId ? { ...s, events } : s
        )
      );
    } catch (err) {
      console.error('Error updating preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    } finally {
      setPreferencesLoading(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
        </div>
        <p className="text-gray-400">Please sign in to manage your notification preferences.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-6 h-6 text-purple-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-purple-500" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-300 text-xs underline hover:no-underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Active Subscriptions</h3>
        <p className="text-gray-400 text-sm">
          You'll be notified when these raffles end or when you win.
        </p>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No active subscriptions</p>
          <p className="text-gray-500 text-sm">
            Visit a raffle and click "Notify Me" to subscribe.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="bg-gray-100 dark:bg-[#1A2238] rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Bell className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-gray-900 dark:text-white font-medium">
                        Raffle #{subscription.raffleId}
                      </p>
                      <span
                        className={`
                          text-xs px-2 py-0.5 rounded-full font-medium
                          ${
                            subscription.channel === 'push'
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-purple-500/15 text-purple-400'
                          }
                        `}
                      >
                        {subscription.channel}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      Subscribed {new Date(subscription.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === subscription.id ? null : subscription.id)}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-[#1F2847] hover:bg-gray-300 dark:hover:bg-[#252E50]
                      text-gray-500 dark:text-gray-400 transition-colors"
                    title="Manage event preferences"
                    aria-label={`Manage event preferences for raffle #${subscription.raffleId}`}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        expandedId === subscription.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <Link
                    to={`/raffles/${subscription.raffleId}`}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-[#1F2847] hover:bg-gray-300 dark:hover:bg-[#252E50]
                      text-gray-500 dark:text-gray-400 transition-colors"
                    title="View raffle"
                    aria-label={`View raffle #${subscription.raffleId}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleUnsubscribe(subscription)}
                    disabled={removingId === subscription.id}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400
                      transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Unsubscribe"
                    aria-label={`Unsubscribe from raffle #${subscription.raffleId}`}
                  >
                    {removingId === subscription.id ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {expandedId === subscription.id && (
                <div className="border-t border-gray-200 dark:border-[#0F1829] p-4 bg-gray-50 dark:bg-[#0F1829]">
                  <NotificationEventPreferences
                    selectedEvents={(subscription.events as NotificationEventType[]) || []}
                    onEventsChange={(events) => handleEventPreferencesChange(subscription.id, events)}
                    isLoading={preferencesLoading === subscription.id}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-blue-300 text-sm">
          Notifications are sent when a raffle ends or when you win. Make sure your email is
          reachable and push notifications are enabled in your browser.
        </p>
      </div>
    </div>
  );
}
