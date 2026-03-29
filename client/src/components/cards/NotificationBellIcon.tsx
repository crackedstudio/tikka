/**
 * NotificationBellIcon Component
 *
 * Compact notification bell icon for raffle cards
 * Shows subscription status and allows quick toggle
 */

import { Bell, BellOff } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthContext } from '../../providers/AuthProvider';

interface NotificationBellIconProps {
  raffleId: number;
  onAuthRequired?: () => void;
}

export default function NotificationBellIcon({
  raffleId,
  onAuthRequired,
}: NotificationBellIconProps) {
  const { isAuthenticated } = useAuthContext();
  const { isSubscribed, isLoading, subscribe, unsubscribe } = useNotifications(raffleId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
    } catch (err) {
      console.error('Subscription toggle failed:', err);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`
        p-2 rounded-lg transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${
          isSubscribed
            ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
        }
      `}
      title={isSubscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : isSubscribed ? (
        <Bell className="w-5 h-5 fill-current" />
      ) : (
        <BellOff className="w-5 h-5" />
      )}
    </button>
  );
}
