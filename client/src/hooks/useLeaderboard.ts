import { useState, useEffect, useCallback, useRef } from "react";
import { 
  fetchLeaderboard, 
  type LeaderboardResponse, 
  type LeaderboardParams 
} from "../services/leaderboardService";

export const useLeaderboard = (params?: LeaderboardParams) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  const loadLeaderboard = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchLeaderboard(params);

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
    loadLeaderboard();
  }, [loadLeaderboard]);

  return { data, isLoading, error, refetch: loadLeaderboard };
};
