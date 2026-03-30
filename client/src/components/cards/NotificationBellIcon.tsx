/**
 * NotificationBellIcon Component
 *
 * Compact notification bell icon for raffle cards
 * Shows subscription status and allows quick toggle
 */

import { Bell} from 'lucide-react';
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
      className={`inline-flex items-center justify-center rounded-full p-1.5 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${
        isSubscribed
          ? 'text-violet-400 hover:text-violet-300'
          : 'text-white/60 hover:text-white'
      }`}
      title={isSubscribed ? 'Notifications enabled' : 'Enable notifications'}
    >
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Bell
          className={`h-5 w-5 transition-all duration-300 ${
            isSubscribed
              ? 'fill-current text-violet-400 scale-110 '
              : 'fill-none stroke-current text-white/60'
          }`}
        />
      )}
    </button>
  );
}
