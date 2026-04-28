/**
 * NotificationSubscribeButton
 *
 * Toggle button for subscribing / unsubscribing to raffle notifications.
 * - Authenticated users can pick a channel (email / push) and subscribe.
 * - Unauthenticated users see an inline prompt to sign in.
 * - Shows subscription status, loading state, and inline error feedback.
 */

import { useState } from 'react';
import { Bell, BellOff, ChevronDown } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useAuthContext } from '../providers/AuthProvider';
import type { NotificationChannel } from '../services/notificationService';

interface NotificationSubscribeButtonProps {
  raffleId: number;
  /** 'default' shows label text; 'compact' shows icon only */
  variant?: 'default' | 'compact';
  onAuthRequired?: () => void;
}

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  push: 'Push',
};

export default function NotificationSubscribeButton({
  raffleId,
  variant = 'default',
  onAuthRequired,
}: NotificationSubscribeButtonProps) {
  const { isAuthenticated } = useAuthContext();
  const { isSubscribed, isLoading, error, subscribe, unsubscribe, clearError } =
    useNotifications(raffleId);

  const [channel, setChannel] = useState<NotificationChannel>('email');
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCompact = variant === 'compact';

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  const handleToggle = async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }

    try {
      if (isSubscribed) {
        await unsubscribe(raffleId);
        flash('Unsubscribed successfully');
      } else {
        await subscribe(raffleId, channel);
        flash('Subscribed! You\'ll be notified when this raffle ends or you win.');
      }
    } catch {
      // error state is managed by the hook
    }
  };

  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-2">
        {/* Channel picker — only shown when not yet subscribed and not compact */}
        {!isSubscribed && !isCompact && isAuthenticated && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowChannelPicker((v) => !v)}
              className="flex items-center gap-1 px-3 py-3 rounded-xl text-sm font-medium
                bg-gray-100 dark:bg-[#1A2238] text-gray-700 dark:text-gray-300
                hover:bg-gray-200 dark:hover:bg-[#1F2847] transition-colors"
              aria-label="Select notification channel"
            >
              {CHANNEL_LABELS[channel]}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showChannelPicker && (
              <div
                className="absolute top-full left-0 mt-1 z-10 bg-white dark:bg-[#1A2238]
                  border border-gray-200 dark:border-[#2A3450] rounded-xl shadow-lg overflow-hidden"
              >
                {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      setChannel(ch);
                      setShowChannelPicker(false);
                    }}
                    className={`
                      w-full text-left px-4 py-2 text-sm transition-colors
                      ${
                        channel === ch
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1F2847]'
                      }
                    `}
                  >
                    {CHANNEL_LABELS[ch]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main subscribe / unsubscribe button */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading}
          aria-pressed={isSubscribed}
          aria-label={isSubscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
          className={`
            flex items-center justify-center gap-2 rounded-xl font-medium
            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
            ${isCompact ? 'px-3 py-2 text-sm' : 'px-6 py-3'}
            ${
              isSubscribed
                ? 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
            }
          `}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {!isCompact && <span>Loading…</span>}
            </>
          ) : isSubscribed ? (
            <>
              <BellOff className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
              {!isCompact && <span>Unsubscribe</span>}
            </>
          ) : (
            <>
              <Bell className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
              {!isCompact && <span>Notify Me</span>}
            </>
          )}
        </button>
      </div>

      {/* Success feedback */}
      {successMsg && (
        <p className="text-sm text-green-400">{successMsg}</p>
      )}

      {/* Error feedback */}
      {error && (
        <p className="text-sm text-red-400">
          {error}{' '}
          <button
            type="button"
            onClick={clearError}
            className="underline hover:no-underline"
          >
            Dismiss
          </button>
        </p>
      )}

      {/* Sign-in nudge for unauthenticated users */}
      {!isAuthenticated && !isCompact && (
        <p className="text-xs text-gray-400">Sign in to receive notifications</p>
      )}
    </div>
  );
}
