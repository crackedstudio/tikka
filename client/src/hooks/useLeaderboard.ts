import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboard, type LeaderboardParams } from "../services/leaderboardService";
import { queryKeys } from "../utils/queryKeys";

export const useLeaderboard = (params?: LeaderboardParams) => {
  const query = useQuery({
    queryKey: queryKeys.leaderboard.list(params),
    queryFn: () => fetchLeaderboard(params),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
