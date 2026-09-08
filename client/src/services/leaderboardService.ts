import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardSortBy,
  LeaderboardParams,
} from "../types/api-types";

export type { LeaderboardEntry, LeaderboardResponse, LeaderboardSortBy, LeaderboardParams };

/** @deprecated use LeaderboardParams from api-types directly */
export type LeaderboardParamsLegacy = LeaderboardParams;

/**
 * Fetch leaderboard data from the backend
 * @param params - Optional query parameters (by, limit, cursor, offset)
 * @returns Leaderboard response with entries
 */
export async function fetchLeaderboard(
  params: LeaderboardParams = {}
): Promise<LeaderboardResponse> {
  const queryParams = new URLSearchParams();

  if (params.by) queryParams.set("by", params.by);
  if (params.limit !== undefined) queryParams.set("limit", String(params.limit));
  if (params.cursor !== undefined) queryParams.set("cursor", params.cursor);
  if (params.offset !== undefined) queryParams.set("offset", String(params.offset));

  const queryString = queryParams.toString();
  const endpoint = queryString
    ? `${API_CONFIG.endpoints.leaderboard}?${queryString}`
    : API_CONFIG.endpoints.leaderboard;

  return api.get<LeaderboardResponse>(endpoint);
}
