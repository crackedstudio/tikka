import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { env } from '../config/env.config';
import { PushNotificationService, DeliveryMetrics } from '../services/notifications/push-notification.service';
import { MaintenanceModeService } from '../maintenance/maintenance-mode.service';
import { MetadataRedisService } from '../services/metadata/metadata-redis.service';

export interface HealthResult {
  status: 'ok' | 'degraded';
  indexer: 'ok' | 'error';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  supabase: 'ok' | 'error';
  emailProvider: 'not_configured';
  unhealthy: string[];
  /** Push delivery failure counts since process start, by class. */
  pushDelivery: DeliveryMetrics;
  timestamp: string;
  maintenance?: boolean;
}

@Injectable()
export class HealthService {
  private readonly indexerUrl: string;
  private readonly indexerTimeoutMs: number;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly maintenanceService: MaintenanceModeService,
    private readonly metadataRedis: MetadataRedisService,
  ) {
    this.indexerUrl = this.config
      .getOrThrow<string>('INDEXER_URL')
      .replace(/\/$/, '');
    this.indexerTimeoutMs = this.config.get<number>('INDEXER_TIMEOUT_MS', 5000);
    this.supabaseUrl = env.supabase.url.replace(/\/$/, '');
    this.supabaseKey = env.supabase.serviceRoleKey;
  }

  async getHealth(): Promise<HealthResult> {
    const [indexerOk, supabaseOk, databaseOk, redisOk] = await Promise.all([
      this.checkIndexer(),
      this.checkSupabase(),
      this.checkDatabase(),
      this.metadataRedis.ping(1000),
    ]);

    const indexer: 'ok' | 'error' = indexerOk ? 'ok' : 'error';
    const database: 'ok' | 'error' = databaseOk ? 'ok' : 'error';
    const redis: 'ok' | 'error' = redisOk ? 'ok' : 'error';
    const supabase: 'ok' | 'error' = supabaseOk ? 'ok' : 'error';
    const unhealthy = Object.entries({ indexer, database, redis, supabase })
      .filter(([, dependencyStatus]) => dependencyStatus === 'error')
      .map(([name]) => name);
    const status: 'ok' | 'degraded' = unhealthy.length > 0 ? 'degraded' : 'ok';

    const maintenance = this.maintenanceService.isEnabled();

    return {
      status,
      indexer,
      database,
      redis,
      supabase,
      emailProvider: 'not_configured',
      unhealthy,
      pushDelivery: this.pushNotificationService.getDeliveryMetrics(),
      timestamp: new Date().toISOString(),
      ...(maintenance && { maintenance }),
    };
  }

  /**
   * Ping the indexer's own health endpoint.
   * Returns true if it responds within the timeout.
   */
  private async checkIndexer(): Promise<boolean> {
    try {
      const res = await fetch(`${this.indexerUrl}/health`, {
        signal: AbortSignal.timeout(this.indexerTimeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lightweight Supabase reachability check via the REST endpoint.
   * Any HTTP response (including 401) means reachable.
   * Only network failures or timeouts are treated as errors.
   */
  private async checkSupabase(): Promise<boolean> {
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
        },
        signal: AbortSignal.timeout(2000),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Query a known table to distinguish database availability from API reachability. */
  private async checkDatabase(): Promise<boolean> {
    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/siws_nonces?select=nonce&limit=0`, {
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
        },
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}