import { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '../../providers/AuthProvider';
import { getUserSubscriptions, type UserSubscription } from '../../services/notificationService';

export interface UseNotificationSubscriptionsResult {
    data: UserSubscription[];
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useNotificationSubscriptions(): UseNotificationSubscriptionsResult {
    const { isAuthenticated } = useAuthContext();

    const [data, setData] = useState<UserSubscription[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const subs = await getUserSubscriptions();
            setData(subs);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            setData([]);
            setError(null);
            setIsLoading(false);
            return;
        }
        void refetch();
    }, [isAuthenticated, refetch]);

    return { data, isLoading, error, refetch };
}
