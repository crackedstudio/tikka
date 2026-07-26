/**
 * NotificationPreferencesSection
 *
 * Settings section for managing notification subscriptions.
 * Displays active subscriptions and allows unsubscribing from raffles.
 * Uses useUserSubscriptions hook for typed loading and error states.
 */

import { Bell, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUserSubscriptions } from '../../hooks/useUserSubscriptions';

export default function NotificationPreferencesSection() {
  const {
    subscriptions,
    isLoading,
    error,
    unsubscribe,
    clearError,
  } = useUserSubscriptions();

  if (isLoading && subscriptions.length === 0) {
    return (
      <div data-testid="notification-section">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="notification-section" className="bg-white dark:bg-[#11172E] rounded-3xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-purple-500" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
      </div>

      {error && (
        <div data-testid="error-message" className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={clearError}
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
            <div key={subscription.id} className="bg-gray-100 dark:bg-[#1A2238] rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-gray-900 dark:text-white font-medium">
                  Raffle #{subscription.raffleId}
                </p>
                <p className="text-gray-400 text-sm">
                  Subscribed {new Date(subscription.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Link
                to={`/raffles/${subscription.raffleId}`}
                className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors text-sm"
              >
                View
              </Link>
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