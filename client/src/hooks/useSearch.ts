import { useState, useEffect, useRef } from "react";
import { searchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem, ApiRaffleListResponse } from "../types/types";

export const useSearch = (query: string) => {
    const [results, setResults] = useState<ApiRaffleListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    useEffect(() => {
        const currentRequest = ++requestId.current;

        if (!query.trim()) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        searchRaffles(query)
            .then((response: ApiRaffleListResponse) => {
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
    }, [query]);

    return { results, isLoading, error };
};