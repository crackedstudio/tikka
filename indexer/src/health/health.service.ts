import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { CursorManagerService } from '../ingestor/cursor-manager.service';

export const LAG_THRESHOLD_DEFAULT = 100;

export interface HealthResult {
  status: 'ok' | 'degraded';
  lag_ledgers: number | null;
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
}

@Injectable()
export class HealthService {
  private readonly horizonUrl: string;
  private readonly lagThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly cursorManager: CursorManagerService,
  ) {
    this.horizonUrl = this.configService.get<string>(
      'HORIZON_URL',
      'https://horizon.stellar.org',
    ).replace(/\/$/, '');
    this.lagThreshold = this.configService.get<number>(
      'LAG_THRESHOLD',
      LAG_THRESHOLD_DEFAULT,
    );
  }

  async getHealth(): Promise<HealthResult> {
    const [dbOk, redisOk, latestLedger, cursor] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.fetchLatestLedger(),
      this.cursorManager.getCursor(),
    ]);

    const db: 'ok' | 'error' = dbOk ? 'ok' : 'error';
    const redis: 'ok' | 'error' = redisOk ? 'ok' : 'error';

    let lag_ledgers: number | null = null;
    if (latestLedger != null && cursor != null && cursor.lastLedger > 0) {
      lag_ledgers = Math.max(0, latestLedger - cursor.lastLedger);
    }

    const degradedByLag =
      lag_ledgers != null && lag_ledgers > this.lagThreshold;
    const status: 'ok' | 'degraded' =
      db === 'error' || redis === 'error' || degradedByLag ? 'degraded' : 'ok';

    return { status, lag_ledgers, db, redis };
  }

  private async checkDb(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) return false;
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    return this.cacheService.ping();
  }

  /**
   * Fetches the latest closed ledger sequence from Horizon.
   * Returns null if the request fails (e.g. network or Horizon down).
   */
  private async fetchLatestLedger(): Promise<number | null> {
    try {
      const res = await fetch(
        `${this.horizonUrl}/ledgers?order=desc&limit=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as {
        _embedded?: { records?: Array<{ sequence: string }> };
      };
      const seq = json._embedded?.records?.[0]?.sequence;
      return seq != null ? parseInt(seq, 10) : null;
    } catch {
      return null;
    }
  }

  /** Lag above this value is considered degraded. */
  getLagThreshold(): number {
    return this.lagThreshold;
  }
}
