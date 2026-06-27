import { useQuery } from "@tanstack/react-query";
import { searchRaffles } from "../services/raffleService";
import { queryKeys } from "../utils/queryKeys";

export const useSearch = (query: string) => {
    const searchQuery = useQuery({
        queryKey: queryKeys.raffles.search(query),
        queryFn: () => searchRaffles(query),
        enabled: !!query.trim(),
    });

    return {
        results: searchQuery.data?.raffles ?? [],
        isLoading: searchQuery.isLoading,
        error: searchQuery.error,
    };
};