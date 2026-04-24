import { Injectable } from '@nestjs/common';
import { env } from '../config/env.config';

// ── Response types aligned with indexer API (ARCHITECTURE §3) ─────────────────

export interface IndexerRaffleData {
  id: number;
  creator: string;
  status: string;
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  created_ledger: number;
  finalized_ledger: number | null;
  metadata_cid: string | null;
  created_at: string;
}

export interface IndexerRaffleListItem extends IndexerRaffleData {
  participant_count?: number;
}

export interface IndexerListRafflesFilters {
  status?: string;
  category?: string;
  creator?: string;
  asset?: string;
  limit?: number;
  offset?: number;
}

export interface IndexerListRafflesResponse {
  raffles: IndexerRaffleListItem[];
  total?: number;
}

export interface IndexerUserData {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  first_seen_ledger: number;
  updated_at: string;
}

export interface IndexerUserHistoryItem {
  raffle_id: number;
  status: string;
  tickets_bought: number;
  purchased_at_ledger: number;
  purchase_tx_hash: string;
  prize_amount: string | null;
  is_winner: boolean;
}

export interface IndexerUserHistoryResponse {
  items: IndexerUserHistoryItem[];
  total: number;
}

export interface IndexerLeaderboardEntry {
  address: string;
  total_tickets?: number;
  total_wins?: number;
  total_volume_xlm?: string;
  rank?: number;
}

export interface IndexerLeaderboardResponse {
  entries: IndexerLeaderboardEntry[];
}

export type LeaderboardSortBy = 'wins' | 'volume' | 'tickets';

export interface IndexerLeaderboardFilters {
  by?: LeaderboardSortBy;
  limit?: number;
}

export interface IndexerPlatformStats {
  date: string;
  total_raffles: number;
  total_tickets: number;
  total_volume_xlm: string;
  unique_participants: number;
  prizes_distributed_xlm: string;
}

export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

@Injectable()
export class IndexerService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = env.indexer.url.replace(/\/$/, '');
    this.timeoutMs = env.indexer.timeoutMs;
  }

  private async fetch<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text();
        throw new IndexerError(
          `Indexer ${res.status}: ${body || res.statusText}`,
          res.status,
        );
      }

      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return (await res.json()) as T;
      }
      return {} as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof IndexerError) throw err;
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new IndexerError(
            `Indexer timeout after ${this.timeoutMs}ms`,
            408,
          );
        }
        throw new IndexerError(`Indexer request failed: ${err.message}`);
      }
      throw new IndexerError('Indexer request failed');
    }
  }

  private async fetchOrNull<T>(path: string): Promise<T | null> {
    try {
      return await this.fetch<T>(path);
    } catch (err) {
      if (err instanceof IndexerError && err.statusCode === 404) return null;
      throw err;
    }
  }

  /** Get raffle by id. Returns null if not found or indexer unavailable (404). */
  async getRaffle(raffleId: number): Promise<IndexerRaffleData | null> {
    return this.fetchOrNull<IndexerRaffleData>(`/raffles/${raffleId}`);
  }

  /** List raffles with optional filters. */
  async listRaffles(
    filters: IndexerListRafflesFilters = {},
  ): Promise<IndexerListRafflesResponse> {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.creator) params.set('creator', filters.creator);
    if (filters.asset) params.set('asset', filters.asset);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    if (filters.offset != null) params.set('offset', String(filters.offset));
    const query = params.toString();
    const path = query ? `/raffles?${query}` : '/raffles';
    return this.fetch<IndexerListRafflesResponse>(path);
  }

  /** Get user by Stellar address. Returns null if not found. */
  async getUser(address: string): Promise<IndexerUserData | null> {
    const encoded = encodeURIComponent(address);
    return this.fetchOrNull<IndexerUserData>(`/users/${encoded}`);
  }

  /** Get paginated raffle participation history for a user. */
  async getUserHistory(
    address: string,
    limit?: number,
    offset?: number,
  ): Promise<IndexerUserHistoryResponse> {
    const encoded = encodeURIComponent(address);
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));
    const query = params.toString();
    const path = query
      ? `/users/${encoded}/history?${query}`
      : `/users/${encoded}/history`;
    return this.fetch<IndexerUserHistoryResponse>(path);
  }

  /** Get leaderboard entries sorted by wins, volume, or tickets. */
  async getLeaderboard(
    filters: IndexerLeaderboardFilters = {},
  ): Promise<IndexerLeaderboardResponse> {
    const params = new URLSearchParams();
    if (filters.by) params.set('by', filters.by);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    const query = params.toString();
    const path = query ? `/leaderboard?${query}` : '/leaderboard';
    return this.fetch<IndexerLeaderboardResponse>(path);
  }

  /** Get platform-wide aggregate stats. */
  async getPlatformStats(): Promise<IndexerPlatformStats> {
    return this.fetch<IndexerPlatformStats>('/stats/platform');
  }
}
