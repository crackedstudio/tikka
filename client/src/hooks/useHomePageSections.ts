/**
 * Home Page Section Loaders
 * Isolates each data section (featured, recent, stats, leaderboard) with independent loading/error states
 * Prevents one failed request from blanking the whole page
 */

import { useState, useEffect, useCallback } from 'react';
import type { ApiRaffleListItem } from '../types/types';

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
      const response = await fetch('/api/raffles/featured?limit=3');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setState(prev => ({ ...prev, data: json.raffles, loading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load featured raffles',
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
      const response = await fetch('/api/raffles?status=open&limit=6&sort=recent');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setState(prev => ({ ...prev, data: json.raffles, loading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load recent raffles',
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
      const response = await fetch('/api/stats/platform');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
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
        error: err instanceof Error ? err.message : 'Failed to load platform stats',
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
      const response = await fetch('/api/leaderboard?limit=5&by=wins');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setState(prev => ({
        ...prev,
        data: json.entries.map((e: any, i: number) => ({
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
        error: err instanceof Error ? err.message : 'Failed to load leaderboard',
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, retry: fetch };
}
