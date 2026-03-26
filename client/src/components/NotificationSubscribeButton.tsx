/**
 * NotificationSubscribeButton Component
 *
 * Toggle button for subscribing/unsubscribing to raffle notifications
 * Displays subscription status and handles authentication requirements
 */

import { Bell, BellOff } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useAuthContext } from '../providers/AuthProvider';
import { useState } from 'react';

interface NotificationSubscribeButtonProps {
  raffleId: number;
  variant?: 'default' | 'compact';
  onAuthRequired?: () => void;
}

export default function NotificationSubscribeButton({
  raffleId,
  variant = 'default',
  onAuthRequired,
}: NotificationSubscribeButtonProps) {
  const { isAuthenticated } = useAuthContext();
  const { isSubscribed, isLoading, error, subscribe, unsubscribe, clearError } = useNotifications(raffleId);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleToggleSubscription = async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }

    try {
      if (isSubscribed) {
        await unsubscribe(raffleId);
      } else {
        await subscribe(raffleId);
      }
      
      // Show success message briefly
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      // Error is handled by the hook
      console.error('Subscription toggle failed:', err);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggleSubscription}
        disabled={isLoading}
        className={`
          flex items-center justify-center gap-2 rounded-xl font-medium
          transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          ${isCompact ? 'px-3 py-2 text-sm' : 'px-6 py-3'}
          ${
            isSubscribed
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
          }
        `}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>{isCompact ? '' : 'Loading...'}</span>
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

      {/* Success message */}
      {showSuccess && (
        <div className="text-sm text-green-400 text-center animate-fade-in">
          {isSubscribed ? 'Subscribed successfully!' : 'Unsubscribed successfully!'}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-400 text-center">
          {error}
          <button
            onClick={clearError}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Info text for unauthenticated users */}
      {!isAuthenticated && !isCompact && (
        <p className="text-xs text-gray-400 text-center">
          Sign in to receive notifications
        </p>
      )}
    </div>
  );
}
