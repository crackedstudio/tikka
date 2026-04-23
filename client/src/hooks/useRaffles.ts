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

export const useRaffles = (filters?: RaffleListFilters) => {
    const [raffles, setRaffles] = useState<ApiRaffleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);
    const [refetchFlag, setRefetchFlag] = useState(0);

    const serializedFilters = JSON.stringify(filters);

    useEffect(() => {
        const currentRequest = ++requestId.current;

        setIsLoading(true);
        setError(null);

        const parsed = JSON.parse(serializedFilters) as RaffleListFilters | undefined;
        fetchRaffles(parsed)
            .then((response) => {
                if (currentRequest !== requestId.current) return;
                setRaffles(response.raffles);
                setTotal(response.total ?? response.raffles.length);
            })
            .catch((err) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error("Failed to fetch raffles"));
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
            });
    }, [serializedFilters, refetchFlag]);

    const refetch = useCallback(() => {
        setRefetchFlag((prev: number) => prev + 1);
    }, []);

    return { raffles, total, isLoading, error, refetch };
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
