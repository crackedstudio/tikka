/**
 * Home Page Section Loaders
 *
 * Each section has its own loading/error state so a failing subsection doesn't
 * blank the whole page. All HTTP goes through `apiRequest`, so failures are
 * typed `ApiError` instances and surfaced via `getApiErrorMessage`.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ApiRaffleListItem } from '../types/types';
import { api, getApiErrorMessage } from '../services/apiClient';

export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useFeaturedRaffles(): SectionState<ApiRaffleListItem[]> {
  const [state, setState] = useState<SectionState<ApiRaffleListItem[]>>({
    data: null,
    loading: true,
    error: null,
    retry: () => {},
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const json = await api.get<{ raffles: ApiRaffleListItem[] }>(
        '/raffles/featured?limit=3',
        { silentErrors: true },
      );
      setState(prev => ({ ...prev, data: json.raffles, loading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: getApiErrorMessage(err, 'Failed to load featured raffles'),
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, retry: fetch };
}

export function useRecentRaffles(): SectionState<ApiRaffleListItem[]> {
  const [state, setState] = useState<SectionState<ApiRaffleListItem[]>>({
    data: null,
    loading: true,
    error: null,
    retry: () => {},
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const json = await api.get<{ raffles: ApiRaffleListItem[] }>(
        '/raffles?status=open&limit=6&sort=recent',
        { silentErrors: true },
      );
      setState(prev => ({ ...prev, data: json.raffles, loading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: getApiErrorMessage(err, 'Failed to load recent raffles'),
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, retry: fetch };
}

export interface PlatformStats {
  totalRaffles: number;
  totalTickets: number;
  totalVolumeXlm: string;
  uniqueParticipants: number;
  prizesDistributedXlm: string;
}

interface PlatformStatsResponse {
  total_raffles: number;
  total_tickets: number;
  total_volume_xlm: string;
  unique_participants: number;
  prizes_distributed_xlm: string;
}

export function usePlatformStats(): SectionState<PlatformStats> {
  const [state, setState] = useState<SectionState<PlatformStats>>({
    data: null,
    loading: true,
    error: null,
    retry: () => {},
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const json = await api.get<PlatformStatsResponse>('/stats/platform', {
        silentErrors: true,
      });
      setState(prev => ({
        ...prev,
        data: {
          totalRaffles: json.total_raffles,
          totalTickets: json.total_tickets,
          totalVolumeXlm: json.total_volume_xlm,
          uniqueParticipants: json.unique_participants,
          prizesDistributedXlm: json.prizes_distributed_xlm,
        },
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: getApiErrorMessage(err, 'Failed to load platform stats'),
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, retry: fetch };
}

export interface LeaderboardEntry {
  address: string;
  totalTickets?: number;
  totalWins?: number;
  totalVolumeXlm?: string;
  rank?: number;
}

interface LeaderboardPreviewResponse {
  entries: Array<{
    address: string;
    total_tickets?: number;
    total_wins?: number;
    total_volume_xlm?: string;
  }>;
}

export function useLeaderboardPreview(): SectionState<LeaderboardEntry[]> {
  const [state, setState] = useState<SectionState<LeaderboardEntry[]>>({
    data: null,
    loading: true,
    error: null,
    retry: () => {},
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const json = await api.get<LeaderboardPreviewResponse>(
        '/leaderboard?limit=5&by=wins',
        { silentErrors: true },
      );
      setState(prev => ({
        ...prev,
        data: json.entries.map((e, i: number) => ({
          address: e.address,
          totalTickets: e.total_tickets,
          totalWins: e.total_wins,
          totalVolumeXlm: e.total_volume_xlm,
          rank: i + 1,
        })),
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: getApiErrorMessage(err, 'Failed to load leaderboard'),
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, retry: fetch };
}
