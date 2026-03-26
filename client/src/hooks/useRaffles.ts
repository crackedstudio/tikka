import { useState, useEffect, useRef, useCallback } from "react";
import {
    fetchRaffles,
    fetchRaffleDetail,
    mapDetailToFormattedRaffle,
} from "../services/raffleService";
import type {
    ApiRaffleListItem,
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
        setRefetchFlag((prev) => prev + 1);
    }, []);

    return { raffles, total, isLoading, error, refetch };
};

export const useRaffle = (raffleId: number) => {
    const [raffle, setRaffle] = useState<FormattedRaffle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

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
    }, [raffleId]);

    return { raffle, error, isLoading };
};