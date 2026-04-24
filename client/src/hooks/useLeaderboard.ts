import { useState, useEffect, useCallback, useRef } from "react";
import type { Player, TopPlayer } from "../types/types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface LeaderboardResponse {
    topPlayers: TopPlayer[];
    players: Player[];
}

export const useLeaderboard = (params?: { by?: "wins" | "volume" | "tickets"; limit?: number }) => {
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);
    const requestId = useRef(0);

    const fetchLeaderboard = useCallback(async () => {
        const currentRequest = ++requestId.current;
        setIsLoading(true);
        setError(null);

        try {
            const queryParams = new URLSearchParams();
            if (params?.by) queryParams.append("by", params.by);
            if (params?.limit) queryParams.append("limit", params.limit.toString());

            const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
            const response = await fetch(`${API_BASE_URL}/api/leaderboard${queryString}`);

            if (currentRequest !== requestId.current) return;

            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
            }

            const result = await response.json();

            if (currentRequest !== requestId.current) return;

            setData(result);
        } catch (err) {
            if (currentRequest !== requestId.current) return;
            console.error("Error fetching leaderboard:", err);
            setError(err instanceof Error ? err : new Error("Unknown error"));
        } finally {
            if (currentRequest === requestId.current) {
                setIsLoading(false);
            }
        }
    }, [params?.by, params?.limit]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    return { data, isLoading, error, refetch: fetchLeaderboard };
};
