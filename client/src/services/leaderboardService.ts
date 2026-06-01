import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";

export interface LeaderboardEntry {
  address: string;
  total_tickets?: number;
  total_wins?: number;
  total_volume_xlm?: string;
  rank?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

export type LeaderboardSortBy = "wins" | "volume" | "tickets";

export interface LeaderboardParams {
  by?: LeaderboardSortBy;
  limit?: number;
}

/**
 * Fetch leaderboard data from the backend
 * @param params - Optional query parameters (by, limit)
 * @returns Leaderboard response with entries
 */
export async function fetchLeaderboard(
  params: LeaderboardParams = {}
): Promise<LeaderboardResponse> {
  const queryParams = new URLSearchParams();
  
  if (params.by) {
    queryParams.set("by", params.by);
  }
  
  if (params.limit !== undefined) {
    queryParams.set("limit", String(params.limit));
  }

  const queryString = queryParams.toString();
  const endpoint = queryString 
    ? `${API_CONFIG.endpoints.leaderboard}?${queryString}`
    : API_CONFIG.endpoints.leaderboard;

  return api.get<LeaderboardResponse>(endpoint);
}
