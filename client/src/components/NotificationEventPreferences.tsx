/**
 * NotificationEventPreferences Component
 *
 * Allows users to toggle individual notification event types.
 * Displays checkboxes for each event type with descriptions.
 */

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type NotificationEventType =
  | 'raffle_started'
  | 'ticket_sold'
  | 'draw_completed'
  | 'you_won'
  | 'raffle_ending_soon';

export const NOTIFICATION_EVENTS: Record<NotificationEventType, { label: string; description: string }> = {
  raffle_started: {
    label: 'Raffle Started',
    description: 'When a new raffle you\'re interested in starts',
  },
  ticket_sold: {
    label: 'Ticket Sold',
    description: 'When someone buys a ticket in your raffle',
  },
  draw_completed: {
    label: 'Draw Completed',
    description: 'When a raffle draw is completed',
  },
  you_won: {
    label: 'You Won',
    description: 'When you win a raffle',
  },
  raffle_ending_soon: {
    label: 'Raffle Ending Soon',
    description: 'Reminder when a raffle is about to end',
  },
};

interface NotificationEventPreferencesProps {
  selectedEvents: NotificationEventType[];
  onEventsChange: (events: NotificationEventType[]) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function NotificationEventPreferences({
  selectedEvents,
  onEventsChange,
  isLoading = false,
  error = null,
}: NotificationEventPreferencesProps) {
  const [localEvents, setLocalEvents] = useState<NotificationEventType[]>(selectedEvents);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalEvents(selectedEvents);
    setHasChanges(false);
  }, [selectedEvents]);

  const handleToggle = (event: NotificationEventType) => {
    const updated = localEvents.includes(event)
      ? localEvents.filter((e) => e !== event)
      : [...localEvents, event];
    setLocalEvents(updated);
    setHasChanges(JSON.stringify(updated) !== JSON.stringify(selectedEvents));
  };

  const handleSelectAll = () => {
    const allEvents = Object.keys(NOTIFICATION_EVENTS) as NotificationEventType[];
    setLocalEvents(allEvents);
    setHasChanges(true);
  };

  const handleClearAll = () => {
    setLocalEvents([]);
    setHasChanges(true);
  };

  const handleApply = () => {
    onEventsChange(localEvents);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Event Types</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={isLoading}
            className="text-xs px-3 py-1 rounded-lg bg-gray-200 dark:bg-[#1A2238] text-gray-700 dark:text-gray-300
              hover:bg-gray-300 dark:hover:bg-[#1F2847] transition-colors disabled:opacity-50"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isLoading}
            className="text-xs px-3 py-1 rounded-lg bg-gray-200 dark:bg-[#1A2238] text-gray-700 dark:text-gray-300
              hover:bg-gray-300 dark:hover:bg-[#1F2847] transition-colors disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {(Object.entries(NOTIFICATION_EVENTS) as [NotificationEventType, typeof NOTIFICATION_EVENTS[NotificationEventType]][]).map(
          ([eventType, { label, description }]) => (
            <label
              key={eventType}
              className="flex items-start gap-3 p-4 rounded-xl bg-gray-100 dark:bg-[#1A2238]
                hover:bg-gray-200 dark:hover:bg-[#1F2847] transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={localEvents.includes(eventType)}
                onChange={() => handleToggle(eventType)}
                disabled={isLoading}
                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500
                  dark:border-gray-600 dark:bg-[#0B1220] mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 dark:text-white font-medium">{label}</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{description}</p>
              </div>
            </label>
          )
        )}
      </div>

      {hasChanges && (
        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Preferences'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalEvents(selectedEvents);
              setHasChanges(false);
            }}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-200 dark:bg-[#1A2238] text-gray-700 dark:text-gray-300
              hover:bg-gray-300 dark:hover:bg-[#1F2847] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}

      {!hasChanges && localEvents.length > 0 && (
        <div className="flex items-center gap-2 text-green-400 text-sm pt-2">
          <CheckCircle2 className="w-4 h-4" />
          Preferences saved
        </div>
      )}
    </div>
  );
}
