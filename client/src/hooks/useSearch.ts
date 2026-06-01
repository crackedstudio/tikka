import { useState, useEffect, useRef } from "react";
import { searchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem, SearchFilters } from "../types/types";

export const useSearch = (filters: SearchFilters) => {
    const [results, setResults] = useState<ApiRaffleListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    const serializedFilters = JSON.stringify(filters);

    useEffect(() => {
        const currentRequest = ++requestId.current;

        if (!filters.q?.trim()) {
            setResults([]);
            setIsLoading(false);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        searchRaffles(filters)
            .then((response) => {
                if (currentRequest !== requestId.current) return;
                setResults(response.raffles);
            })
            .catch((err: unknown) => {
                if (currentRequest !== requestId.current) return;
                setError(err instanceof Error ? err : new Error("Search failed"));
            })
            .finally(() => {
                if (currentRequest !== requestId.current) return;
                setIsLoading(false);
            });
    }, [serializedFilters]);

    return { results, isLoading, error };
};
