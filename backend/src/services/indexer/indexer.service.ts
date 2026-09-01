import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { captureIngestionError } from '../../sentry/sentry';
import { BackfillLock } from './backfill-lock';
import type {
  IndexerApiLeaderboardResponse,
  IndexerApiParticipantListResponse,
  IndexerApiPlatformStats,
  IndexerApiRaffleDetail,
  IndexerApiRaffleListResponse,
  IndexerApiTransparencyLog,
  IndexerApiUserHistoryResponse,
  IndexerApiUserProfile,
} from './indexer-api.types';
import {
  mapLeaderboard,
  mapParticipants,
  mapPlatformStats,
  mapRaffleDetail,
  mapRaffleList,
  mapTransparencyLog,
  mapUserHistory,
  mapUserProfile,
} from './indexer.mapper';
import {
  IndexerError,
  type IndexerLeaderboardFilters,
  type IndexerLeaderboardResponse,
  type IndexerListRafflesFilters,
  type IndexerListRafflesResponse,
  type IndexerParticipantListResponse,
  type IndexerPlatformStats,
  type IndexerRaffleData,
  type IndexerTransparencyLog,
  type IndexerUserData,
  type IndexerUserHistoryResponse,
} from './indexer.types';

// Public surface: the backend-owned response types are re-exported here so
// consumers can import them alongside IndexerService. Only the raw indexer
// wire shapes (./indexer-api.types) are intentionally not re-exported.
export {
  IndexerError,
  type IndexerLeaderboardEntry,
  type IndexerLeaderboardFilters,
  type IndexerLeaderboardResponse,
  type IndexerListRafflesFilters,
  type IndexerListRafflesResponse,
  type IndexerParticipant,
  type IndexerParticipantListResponse,
  type IndexerPlatformStats,
  type IndexerRaffleData,
  type IndexerRaffleListItem,
  type IndexerTransparencyEntry,
  type IndexerTransparencyLog,
  type IndexerUserData,
  type IndexerUserHistoryItem,
  type IndexerUserHistoryResponse,
  type LeaderboardSortBy,
  type RaffleFreshness,
  type RaffleMetadata,
  type RaffleWithFreshness,
} from './indexer.types';

/**
 * HTTP client for the indexer service.
 *
 * This is the ONLY module allowed to know the raw indexer wire shapes
 * (`./indexer-api.types`). Every response is translated through `./indexer.mapper`
 * into backend-owned response types (`./indexer.types`) before leaving this
 * boundary, so an indexer schema change cannot silently alter a backend API
 * response. See `docs/contributing/MODULE_BOUNDARIES.md`.
 */
@Injectable()
export class IndexerService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly backfillLock?: BackfillLock,
  ) {
    this.baseUrl = this.config
      .getOrThrow<string>('INDEXER_URL')
      .replace(/\/$/, '');
    this.timeoutMs = this.config.get<number>('INDEXER_TIMEOUT_MS', 5000);
  }

  /**
   * Returns true if the backfill lock is currently held, meaning the active
   * poller should skip its current cycle to avoid concurrent writes.
   */
  isBackfillLockHeld(): boolean {
    if (this.backfillLock?.isLocked()) {
      this.logger.debug('Skipping polling cycle — backfill lock is held');
      return true;
    }
    return false;
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
    const raw = await this.fetchOrNull<IndexerApiRaffleDetail>(`/raffles/${raffleId}`);
    return raw ? mapRaffleDetail(raw) : null;
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
    const raw = await this.fetch<IndexerApiRaffleListResponse>(path);
    return mapRaffleList(raw);
  }

  /** Get user by Stellar address. Returns null if not found. */
  async getUser(address: string): Promise<IndexerUserData | null> {
    const encoded = encodeURIComponent(address);
    const raw = await this.fetchOrNull<IndexerApiUserProfile>(`/users/${encoded}`);
    return raw ? mapUserProfile(raw) : null;
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
    const raw = await this.fetch<IndexerApiUserHistoryResponse>(path);
    return mapUserHistory(raw);
  }

  /** Get leaderboard entries sorted by wins, volume, or tickets. */
  async getLeaderboard(
    filters: IndexerLeaderboardFilters = {},
  ): Promise<IndexerLeaderboardResponse> {
    const params = new URLSearchParams();
    if (filters.by) params.set('by', filters.by);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.offset != null) params.set('offset', String(filters.offset));
    const query = params.toString();
    const path = query ? `/leaderboard?${query}` : '/leaderboard';
    const raw = await this.fetch<IndexerApiLeaderboardResponse>(path);
    return mapLeaderboard(raw);
  }

  /** Get platform-wide aggregate stats. */
  async getPlatformStats(): Promise<IndexerPlatformStats> {
    const raw = await this.fetch<IndexerApiPlatformStats>('/stats/platform');
    return mapPlatformStats(raw);
  }

  /** Get paginated VRF/PRNG audit log entries. */
  async getTransparencyLog(
    limit = 10,
    offset = 0,
    raffleId?: number,
    txHash?: string,
  ): Promise<IndexerTransparencyLog> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (raffleId != null) params.set('raffle_id', String(raffleId));
    if (txHash) params.set('tx_hash', txHash);
    const raw = await this.fetch<IndexerApiTransparencyLog>(`/transparency?${params}`);
    return mapTransparencyLog(raw);
  }

  /** Get paginated list of participants (ticket holders) for a raffle. */
  async getRaffleParticipants(
    raffleId: number,
    limit = 20,
    offset = 0,
  ): Promise<IndexerParticipantListResponse> {
    const params = new URLSearchParams({
      limit: String(Math.min(limit, 100)),
      offset: String(offset),
    });
    const raw = await this.fetch<IndexerApiParticipantListResponse>(
      `/raffles/${raffleId}/participants?${params}`,
    );
    return mapParticipants(raw);
  }

  /** Submit a ledger and its transactions for re-indexing (backfill). */
  async submitLedger(ledgerData: unknown, ledgerSequence?: number): Promise<void> {
    try {
      await this.fetch<void>('/ingest/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ledgerData),
      });
    } catch (err) {
      this.logger.error(
        `submitLedger failed${ledgerSequence !== undefined ? ` for ledger ${ledgerSequence}` : ''}`,
        err,
      );
      captureIngestionError(err, { ledger: ledgerSequence, ledgerPayload: ledgerData });
      throw err;
    }
  }
}
