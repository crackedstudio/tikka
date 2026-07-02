import { useState, useEffect } from "react";
import { searchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem, ApiRaffleListResponse } from "../types/types";

export type SortOption = 'relevance' | 'ending_soon' | 'price_asc' | 'most_tickets';

export const useSearch = (
  query: string,
  categories: string[] = [],
  sort: SortOption = 'relevance',
) => {
    const [results, setResults] = useState<ApiRaffleListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    const categoriesKey = categories.sort().join(",");

    useEffect(() => {
        const currentRequest = ++requestId.current;

    if (!trimmedQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      searchRaffles(trimmedQuery, controller.signal)
        .then((response: ApiRaffleListResponse) => {
          setResults(response.raffles);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            return;
        }

        setIsLoading(true);
        setError(null);

        searchRaffles(query, categories, sort)
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
    }, [query, categoriesKey, sort]);

    return { results, isLoading, error };
};
