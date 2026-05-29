import { Injectable, Optional, EventEmitter } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { CursorManagerService } from '../ingestor/cursor-manager.service';
import { DlqService } from '../ingestor/dlq.service';

export const LAG_THRESHOLD_DEFAULT = 100;
export const LAG_ALERT_THRESHOLD_DEFAULT = 50;

export interface HealthResult {
  status: 'ok' | 'degraded';
  lag_ledgers: number | null;
  lagStatus: 'healthy' | 'degraded' | 'critical';
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  redis_latency_ms: number | null;
  dlq_size: number;
}

@Injectable()
export class HealthService {
  private readonly horizonUrl: string;
  private readonly lagThreshold: number;
  private readonly lagAlertThreshold: number;
  private previousLagStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  private eventEmitter: EventEmitter;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly cursorManagerService: CursorManagerService,
    @Optional() private readonly dlqService?: DlqService,
  ) {
    this.horizonUrl = this.configService.get<string>(
      'HORIZON_URL',
      'https://horizon.stellar.org',
    ).replace(/\/$/, '');
    this.lagThreshold = this.configService.get<number>(
      'LAG_THRESHOLD',
      LAG_THRESHOLD_DEFAULT,
    );
    this.lagAlertThreshold = this.configService.get<number>(
      'INDEXER_LAG_ALERT_THRESHOLD_LEDGERS',
      LAG_ALERT_THRESHOLD_DEFAULT,
    );
    this.eventEmitter = new EventEmitter();
  }

  async getHealth(): Promise<HealthResult> {
    const [dbOk, redisLatency, latestLedger, cursor, dlq_size] = await Promise.all([
      this.checkDb(),
      this.cacheService.latency(),
      this.fetchLatestLedger(),
      this.cursorManagerService.getCursor(),
      this.dlqService ? this.dlqService.count() : Promise.resolve(0),
    ]);

    const db: 'ok' | 'error' = dbOk ? 'ok' : 'error';
    const redis: 'ok' | 'error' = redisLatency !== null ? 'ok' : 'error';

    let lag_ledgers: number | null = null;
    if (latestLedger != null && cursor != null && cursor.lastLedger > 0) {
      lag_ledgers = Math.max(0, latestLedger - cursor.lastLedger);
    }

    // Calculate lag status based on alert threshold
    let lagStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (lag_ledgers !== null) {
      if (lag_ledgers > this.lagAlertThreshold) {
        lagStatus = 'critical';
      } else if (lag_ledgers > this.lagThreshold) {
        lagStatus = 'degraded';
      }
    }

    // Emit alert when crossing into critical status
    if (lagStatus === 'critical' && this.previousLagStatus !== 'critical') {
      this.eventEmitter.emit('indexer_lag_alert', {
        lag_ledgers,
        threshold: this.lagAlertThreshold,
        timestamp: new Date().toISOString(),
      });
    }
    this.previousLagStatus = lagStatus;

    const degradedByLag =
      lag_ledgers != null && lag_ledgers > this.lagThreshold;
    const status: 'ok' | 'degraded' =
      db === 'error' || redis === 'error' || degradedByLag ? 'degraded' : 'ok';

    return { status, lag_ledgers, lagStatus, db, redis, redis_latency_ms: redisLatency, dlq_size };
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

  /** Lag above this value triggers critical alerts. */
  getLagAlertThreshold(): number {
    return this.lagAlertThreshold;
  }

  /** Get the event emitter for listening to lag alerts. */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}
