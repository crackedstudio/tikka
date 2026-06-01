import { useCallback, useState } from 'react';
import type { NotificationEventType } from '../../components/NotificationEventPreferences';

export interface UpdateNotificationEventPreferencesRequest {
  subscriptionId: string;
  events: NotificationEventType[];
}

export interface UseUpdateNotificationEventPreferencesResult {
  isLoading: boolean;
  error: string | null;
  mutate: (req: UpdateNotificationEventPreferencesRequest) => Promise<void>;
}

// NOTE: Backend endpoint for updating event preferences is currently not present.
// This hook provides typed loading/error states so the UI can be wired safely.
// If/when an API endpoint is added, replace the body of `mutate`.
export function useUpdateNotificationEventPreferences(): UseUpdateNotificationEventPreferencesResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (_req: UpdateNotificationEventPreferencesRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      // TODO: replace with real service call
      // await updateNotificationEventPreferences(...)
      throw new Error('Notification event preference update is not implemented');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, error, mutate };
}

