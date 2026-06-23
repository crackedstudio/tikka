import { useState, useEffect, useRef, useCallback } from "react";
import {
    fetchRaffles,
    fetchRaffleDetail,
    fetchUserProfile,
    fetchUserHistory,
    mapDetailToFormattedRaffle,
} from "../services/raffleService";
import type {
    ApiRaffleListItem,
    ApiUserProfile,
    ApiUserHistoryItem,
    RaffleListFilters,
    FormattedRaffle,
} from "../types/types";

// ─── Raffle List Query Status Types ────────────────────────────────────────────────

/**
 * Status flags for raffle list queries.
 * These provide clear, typed states for UI components to render appropriate loading,
 * empty, error, and stale states.
 */
export interface RaffleQueryStatus {
    /** True during the initial data fetch */
    isLoading: boolean;
    /** True during a manual refresh (cached data remains visible) */
    isRefreshing: boolean;
    /** True when the query has successfully loaded data */
    isSuccess: boolean;
    /** True when the query returned an empty result set */
    isEmpty: boolean;
    /** True when the query failed (error state) */
    isError: boolean;
    /** True when data might be outdated (e.g., after a failed refresh) */
    isStale: boolean;
}

/**
 * Return type for useRaffles hook with resilient status flags.
 */
export interface UseRafflesReturn {
    /** The list of raffles */
    raffles: ApiRaffleListItem[];
    /** Total count of raffles (may be larger than current page) */
    total: number;
    /** Status flags for UI rendering */
    status: RaffleQueryStatus;
    /** Error object if query failed */
    error: Error | null;
    /** Manually trigger a refresh (keeps cached data visible) */
    refetch: () => void;
    /** Retry after an error (clears error and refetches) */
    retry: () => void;
}

export const useRaffles = (filters?: RaffleListFilters): UseRafflesReturn => {
    const [raffles, setRaffles] = useState<ApiRaffleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [isStale, setIsStale] = useState(false);
    const requestId = useRef(0);
    const [refetchFlag, setRefetchFlag] = useState(0);

    const serializedFilters = JSON.stringify(filters);

    useEffect(() => {
        const currentRequest = ++requestId.current;
        const isRefresh = hasLoadedOnce;

        if (isRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        const parsed = serializedFilters ? (JSON.parse(serializedFilters) as RaffleListFilters) : undefined;
        fetchRaffles(parsed)
            .then((response) => {
                if (currentRequest !== requestId.current) return;
                setRaffles(response.raffles);
                setTotal(response.total ?? response.raffles.length);
                setHasLoadedOnce(true);
                setIsStale(false);
            })
            .catch((err) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error("Failed to fetch raffles"));
                // Mark as stale if this was a refresh that failed
                if (isRefresh) {
                    setIsStale(true);
                }
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
                setIsRefreshing(false);
            });
    }, [serializedFilters, refetchFlag, hasLoadedOnce]);

    const refetch = useCallback(() => {
        setRefetchFlag((prev: number) => prev + 1);
    }, []);

    const retry = useCallback(() => {
        setError(null);
        setRefetchFlag((prev: number) => prev + 1);
    }, []);

    // Compute derived status flags
    const status: RaffleQueryStatus = {
        isLoading,
        isRefreshing,
        isSuccess: hasLoadedOnce && !error,
        isEmpty: hasLoadedOnce && !error && raffles.length === 0,
        isError: error !== null,
        isStale,
    };

    return { raffles, total, status, error, refetch, retry };
};

export const useRaffle = (raffleId: number) => {
    const [raffle, setRaffle] = useState<FormattedRaffle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);
    const [refetchFlag, setRefetchFlag] = useState(0);

    useEffect(() => {
        if (!raffleId) {
            setRaffle(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        const currentRequest = ++requestId.current;

        setIsLoading(true);
        setError(null);

        fetchRaffleDetail(raffleId)
            .then((detail) => {
                if (currentRequest !== requestId.current) return;
                setRaffle(mapDetailToFormattedRaffle(detail));
            })
            .catch((err) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error(`Failed to fetch raffle ${raffleId}`));
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
            });
    }, [raffleId, refetchFlag]);

    const refetch = useCallback(() => {
        setRefetchFlag((prev: number) => prev + 1);
    }, []);

    return { raffle, error, isLoading, refetch };
};

const HISTORY_PAGE_SIZE = 10;

export const useUserProfile = (address: string | null) => {
    const [profile, setProfile] = useState<ApiUserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    useEffect(() => {
        if (!address) {
            setProfile(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        const currentRequest = ++requestId.current;
        setIsLoading(true);
        setError(null);

        fetchUserProfile(address)
            .then((data) => {
                if (currentRequest !== requestId.current) return;
                setProfile(data);
            })
            .catch((err) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error("Failed to fetch user profile"));
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
            });
    }, [address]);

    return { profile, isLoading, error };
};

export const useUserHistory = (address: string | null) => {
    const [items, setItems] = useState<ApiUserHistoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    useEffect(() => {
        if (!address) {
            setItems([]);
            setTotal(0);
            setIsLoading(false);
            setError(null);
            return;
        }

        const currentRequest = ++requestId.current;
        setIsLoading(true);
        setError(null);

        fetchUserHistory(address, HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE)
            .then((data) => {
                if (currentRequest !== requestId.current) return;
                setItems(data.items);
                setTotal(data.total);
            })
            .catch((err) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error("Failed to fetch user history"));
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
            });
    }, [address, page]);

    const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
    const hasPrev = page > 0;
    const hasNext = page < totalPages - 1;

    const goToPage = useCallback((p: number) => {
        setPage(Math.max(0, Math.min(p, totalPages - 1)));
    }, [totalPages]);

    return { items, total, page, totalPages, hasPrev, hasNext, goToPage, isLoading, error };
};
