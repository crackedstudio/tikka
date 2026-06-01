import { useCallback, useState } from 'react';
import { unsubscribeFromRaffle } from '../../services/notificationService';

export interface UseUnsubscribeFromRaffleResult {
    isLoading: boolean;
    error: string | null;
    mutate: (raffleId: number) => Promise<void>;
}

export function useUnsubscribeFromRaffle(): UseUnsubscribeFromRaffleResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mutate = useCallback(async (raffleId: number) => {
        setIsLoading(true);
        setError(null);
        try {
            await unsubscribeFromRaffle(raffleId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { isLoading, error, mutate };
}

