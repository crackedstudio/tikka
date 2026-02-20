import { useState, useEffect } from "react";
import type { Player, TopPlayer } from "../types/types";

// The backend API base URL. Fallback to localhost if not defined in env.
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface LeaderboardResponse {
    topPlayers: TopPlayer[];
    players: Player[];
}

export const useLeaderboard = (params?: { by?: "wins" | "volume" | "tickets"; limit?: number }) => {
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                const queryParams = new URLSearchParams();
                if (params?.by) queryParams.append("by", params.by);
                if (params?.limit) queryParams.append("limit", params.limit.toString());
                
                const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
                const response = await fetch(`${API_BASE_URL}/api/leaderboard${queryString}`);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
                }
                
                // Assuming backend returns an object that directly satisfies this or similar
                const result = await response.json();
                
                // Map the backend response to our expected client types if needed
                // Backend controller currently just returns `leaderboardService.getLeaderboard()`
                // For now, we expect the service to return { topPlayers, players } format based on UI needs.
                setData(result);
            } catch (err) {
                console.error("Error fetching leaderboard:", err);
                setError(err instanceof Error ? err : new Error("Unknown error"));
                // Fallback to empty data structure on error rather than breaking UI
                setData({ topPlayers: [], players: [] });
            } finally {
                setIsLoading(false);
            }
        };

        fetchLeaderboard();
    }, [params?.by, params?.limit]);

    return { data, isLoading, error };
};
