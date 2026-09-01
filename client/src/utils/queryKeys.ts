import type { RaffleListFilters } from "../types/types";
import type { LeaderboardParams } from "../services/leaderboardService";

export const queryKeys = {
    raffles: {
        all: () => ["raffles"] as const,
        list: (filters?: RaffleListFilters) => ["raffles", "list", filters] as const,
        detail: (id: number) => ["raffles", "detail", id] as const,
        search: (query: string) => ["raffles", "search", query] as const,
    },
    users: {
        profile: (address: string) => ["users", "profile", address] as const,
        history: (address: string, page: number) => ["users", "history", address, page] as const,
    },
    leaderboard: {
        list: (params?: LeaderboardParams) => ["leaderboard", "list", params] as const,
    },
};
