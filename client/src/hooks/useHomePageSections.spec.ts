import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useFeaturedRaffles,
  useRecentRaffles,
  usePlatformStats,
  useLeaderboardPreview,
} from './useHomePageSections';

const mockRaffles = [
  { id: 1, ticket_price: '1000000', asset: 'XLM', status: 'open' },
  { id: 2, ticket_price: '2000000', asset: 'XLM', status: 'open' },
];

const mockStats = {
  total_raffles: 100,
  total_tickets: 5000,
  total_volume_xlm: '50000000000',
  unique_participants: 1500,
  prizes_distributed_xlm: '25000000000',
};

describe('useHomePageSections - Independent Section Loading', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe('Partial API Failures', () => {
    it('loads featured raffles even when recent fails', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('featured')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ raffles: mockRaffles }),
          });
        }
        return Promise.reject(new Error('Network error'));
      });

      const { result: featuredResult } = renderHook(() => useFeaturedRaffles());
      
      await waitFor(() => {
        expect(featuredResult.current.loading).toBe(false);
      });

      expect(featuredResult.current.data).toEqual(mockRaffles);
      expect(featuredResult.current.error).toBeNull();
    });

    it('renders platform stats even when leaderboard fails', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats),
          });
        }
        return Promise.reject(new Error('HTTP 500'));
      });

      const { result } = renderHook(() => usePlatformStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual({
        totalRaffles: 100,
        totalTickets: 5000,
        totalVolumeXlm: '50000000000',
        uniqueParticipants: 1500,
        prizesDistributedXlm: '25000000000',
      });
    });
  });

  describe('Successful Mixed Data', () => {
    it('loads all sections with valid data', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('featured')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ raffles: mockRaffles }),
          });
        }
        if (url.includes('stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: mockRaffles.map((r, i) => ({ ...r, address: `G${i}...ABCD` })) }),
        });
      });

      const { result: featured } = renderHook(() => useFeaturedRaffles());
      const { result: stats } = renderHook(() => usePlatformStats());
      const { result: leaderboard } = renderHook(() => useLeaderboardPreview());

      await waitFor(() => {
        expect(featured.current.loading).toBe(false);
        expect(stats.current.loading).toBe(false);
        expect(leaderboard.current.loading).toBe(false);
      });

      expect(featured.current.data).toBeTruthy();
      expect(stats.current.data).toBeTruthy();
      expect(leaderboard.current.data).toBeTruthy();
      expect(featured.current.error).toBeNull();
      expect(stats.current.error).toBeNull();
      expect(leaderboard.current.error).toBeNull();
    });
  });

  describe('Retry Mechanism', () => {
    it('retries loading on user request', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          json: () => Promise.resolve({ raffles: mockRaffles }),
        };
      });

      const { result } = renderHook(() => useFeaturedRaffles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();

      // Call retry
      result.current.retry();

      await waitFor(() => {
        expect(result.current.data).toEqual(mockRaffles);
      });
    });
  });

  describe('Error Handling', () => {
    it('captures HTTP errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useFeaturedRaffles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toContain('HTTP');
      expect(result.current.data).toBeNull();
    });

    it('captures network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useLeaderboardPreview());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toContain('Network timeout');
    });
  });

  describe('Section Reordering', () => {
    it('sections are independent and can be reordered in UI', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('featured')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ raffles: [{ id: 1, ticket_price: '1000000' }] }),
          });
        }
        if (url.includes('recent')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ raffles: [{ id: 2, ticket_price: '2000000' }] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { result: featured } = renderHook(() => useFeaturedRaffles());
      const { result: recent } = renderHook(() => useRecentRaffles());

      await waitFor(() => {
        expect(featured.current.data).toBeTruthy();
        expect(recent.current.data).toBeTruthy();
      });

      // Each section loads independently without dependency on the other
      expect(featured.current.data?.[0].id).toBe(1);
      expect(recent.current.data?.[0].id).toBe(2);
    });
  });
});
