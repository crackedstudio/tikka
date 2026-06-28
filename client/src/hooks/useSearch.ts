import { useState, useEffect } from "react";
import { searchRaffles } from "../services/raffleService";
import type { ApiRaffleListItem, ApiRaffleListResponse } from "../types/types";

const SEARCH_DEBOUNCE_MS = 300;

export const useSearch = (query: string) => {
  const [results, setResults] = useState<ApiRaffleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();

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

          setError(err instanceof Error ? err : new Error("Search failed"));
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  return { results, isLoading, error };
};
