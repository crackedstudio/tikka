import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { queryKeys } from "../utils/queryKeys";

export interface RaffleQueryStatus {
    isLoading: boolean;
    isRefreshing: boolean;
    isSuccess: boolean;
    isEmpty: boolean;
    isError: boolean;
    isStale: boolean;
}

export interface UseRafflesReturn {
    raffles: ApiRaffleListItem[];
    total: number;
    status: RaffleQueryStatus;
    error: Error | null;
    refetch: () => void;
    retry: () => void;
}

export const useRaffles = (filters?: RaffleListFilters): UseRafflesReturn => {
    const query = useQuery({
        queryKey: queryKeys.raffles.list(filters),
        queryFn: () => fetchRaffles(filters),
    });

    const raffles = query.data?.raffles ?? [];
    const total = query.data?.total ?? raffles.length;

    const status: RaffleQueryStatus = {
        isLoading: query.isLoading,
        isRefreshing: query.isFetching && !query.isLoading,
        isSuccess: query.isSuccess,
        isEmpty: query.isSuccess && raffles.length === 0,
        isError: query.isError,
        isStale: query.isStale,
    };

    return {
        raffles,
        total,
        status,
        error: query.error,
        refetch: query.refetch,
        retry: query.refetch,
    };
};

export const useRaffle = (raffleId: number) => {
    const query = useQuery({
        queryKey: queryKeys.raffles.detail(raffleId),
        queryFn: async () => {
            const detail = await fetchRaffleDetail(raffleId);
            return mapDetailToFormattedRaffle(detail);
        },
        enabled: !!raffleId,
    });

    return {
        raffle: query.data ?? null,
        error: query.error,
        isLoading: query.isLoading,
        refetch: query.refetch,
    };
};

const HISTORY_PAGE_SIZE = 10;

export const useUserProfile = (address: string | null) => {
    const query = useQuery({
        queryKey: queryKeys.users.profile(address as string),
        queryFn: () => fetchUserProfile(address as string),
        enabled: !!address,
    });

    return {
        profile: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
    };
};

export const useUserHistory = (address: string | null) => {
    const [page, setPage] = useState(0);

    const query = useQuery({
        queryKey: queryKeys.users.history(address as string, page),
        queryFn: () => fetchUserHistory(address as string, HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE),
        enabled: !!address,
    });

    const items = query.data?.items ?? [];
    const total = query.data?.total ?? 0;

    const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
    const hasPrev = page > 0;
    const hasNext = page < totalPages - 1;

    const goToPage = useCallback((p: number) => {
        setPage(Math.max(0, Math.min(p, totalPages - 1)));
    }, [totalPages]);

    return {
        items,
        total,
        page,
        totalPages,
        hasPrev,
        hasNext,
        goToPage,
        isLoading: query.isLoading,
        error: query.error,
    };
};
