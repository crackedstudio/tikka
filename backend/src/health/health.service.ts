import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { env } from '../config/env.config';
import { RAFFLE_IMAGE_BUCKET } from '../config/upload.config';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import {
  DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
  READINESS_DEPENDENCIES,
} from './health.constants';
import {
  runWithTimeout,
  safeProbeDetail,
  sanitizeHost,
} from './health-check.utils';
import {
  DependencyHealth,
  EMPTY_DELIVERY_METRICS,
  HealthDependencies,
  HealthResult,
  LivenessResult,
  OverallHealthStatus,
  ReadinessResult,
} from './health.types';

const PUSH_TOKENS_TABLE = 'push_tokens';

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private readonly startTime = Date.now();
  private readonly defaultTimeoutMs: number;
  private readonly indexerUrl: string;
  private readonly indexerTimeoutMs: number;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;
  private readonly horizonUrl: string;
  private readonly horizonTimeoutMs: number;
  private redis: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {
    this.defaultTimeoutMs = this.config.get<number>(
      'HEALTH_CHECK_TIMEOUT_MS',
      DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
    );
    this.indexerUrl = this.config
      .getOrThrow<string>('INDEXER_URL')
      .replace(/\/$/, '');
    this.indexerTimeoutMs = this.config.get<number>(
      'INDEXER_TIMEOUT_MS',
      5000,
    );
    this.supabaseUrl = env.supabase.url.replace(/\/$/, '');
    this.supabaseKey = env.supabase.serviceRoleKey;
    this.horizonUrl = env.stellar.horizonUrl.replace(/\/$/, '');
    this.horizonTimeoutMs = this.config.get<number>(
      'BACKFILL_HORIZON_TIMEOUT_MS',
      10_000,
    );
  }

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>('REDIS_URL').trim();
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: this.defaultTimeoutMs,
    });
    this.redis.on('error', () => {
      /* health probes surface connectivity; avoid log noise here */
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  }

  getLiveness(): LivenessResult {
    return {
      status: 'ok',
      uptimeMs: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResult> {
    const dependencies = await this.checkDependencies();
    const checks = {
      database: dependencies.database,
      redis: dependencies.redis,
      supabase: dependencies.supabase,
      indexer: dependencies.indexer,
    };
    const status = this.isReady(checks) ? 'ready' : 'not_ready';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth(): Promise<HealthResult> {
    const dependencies = await this.checkDependencies();

    return {
      status: this.computeOverallStatus(dependencies),
      dependencies,
      pushDelivery: EMPTY_DELIVERY_METRICS,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDependencies(): Promise<HealthDependencies> {
    const [
      database,
      redis,
      supabase,
      horizon,
      indexer,
      storage,
      notifications,
    ] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSupabase(),
      this.checkHorizon(),
      this.checkIndexer(),
      this.checkStorage(),
      this.checkNotifications(),
    ]);

    return {
      database,
      redis,
      supabase,
      horizon,
      indexer,
      storage,
      notifications,
    };
  }

  private computeOverallStatus(
    dependencies: HealthDependencies,
  ): OverallHealthStatus {
    const criticalFailed = READINESS_DEPENDENCIES.some(
      (key) => dependencies[key].status === 'error',
    );
    if (criticalFailed) {
      return 'unhealthy';
    }

    const anyDegraded = Object.values(dependencies).some(
      (dep) => dep.status === 'degraded' || dep.status === 'error',
    );
    return anyDegraded ? 'degraded' : 'ok';
  }

  private isReady(
    checks: ReadinessResult['checks'],
  ): boolean {
    return READINESS_DEPENDENCIES.every(
      (key) => checks[key].status === 'ok',
    );
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await runWithTimeout(async () => {
        const { error } = await this.supabase
          .from(PUSH_TOKENS_TABLE)
          .select('user_address')
          .limit(1);
        if (error) {
          throw new Error(error.message);
        }
      }, this.defaultTimeoutMs);

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: `postgres query ok (${sanitizeHost(this.supabaseUrl)})`,
      };
    } catch (err) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'database query failed'),
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    if (!this.redis) {
      return {
        status: 'error',
        latencyMs: null,
        detail: 'redis client not initialized',
      };
    }

    try {
      await runWithTimeout(async () => {
        if (this.redis!.status === 'wait') {
          await this.redis!.connect();
        }
        const pong = await this.redis!.ping();
        if (pong !== 'PONG') {
          throw new Error('unexpected ping response');
        }
      }, this.defaultTimeoutMs);

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: 'redis ping ok',
      };
    } catch (err) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'redis ping failed'),
      };
    }
  }

  private async checkSupabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await runWithTimeout(async () => {
        await fetch(`${this.supabaseUrl}/rest/v1/`, {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
          },
          signal: AbortSignal.timeout(this.defaultTimeoutMs),
        });
      }, this.defaultTimeoutMs);

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: `rest api reachable (${sanitizeHost(this.supabaseUrl)})`,
      };
    } catch (err) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'supabase rest unreachable'),
      };
    }
  }

  private async checkHorizon(): Promise<DependencyHealth> {
    const start = Date.now();
    const timeoutMs = Math.min(this.horizonTimeoutMs, this.defaultTimeoutMs * 2);

    try {
      const res = await fetch(`${this.horizonUrl}/`, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        return {
          status: 'degraded',
          latencyMs: Date.now() - start,
          detail: `horizon returned HTTP ${res.status} (${sanitizeHost(this.horizonUrl)})`,
        };
      }

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: `horizon reachable (${sanitizeHost(this.horizonUrl)})`,
      };
    } catch (err) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'horizon unreachable'),
      };
    }
  }

  private async checkIndexer(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.indexerUrl}/health`, {
        signal: AbortSignal.timeout(this.indexerTimeoutMs),
      });

      if (!res.ok) {
        return {
          status: 'error',
          latencyMs: Date.now() - start,
          detail: `indexer returned HTTP ${res.status} (${sanitizeHost(this.indexerUrl)})`,
        };
      }

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: `indexer reachable (${sanitizeHost(this.indexerUrl)})`,
      };
    } catch (err) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'indexer unreachable'),
      };
    }
  }

  private async checkStorage(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await runWithTimeout(async () => {
        const { error } = await this.supabase.storage
          .from(RAFFLE_IMAGE_BUCKET)
          .list('', { limit: 1 });
        if (error) {
          throw new Error(error.message);
        }
      }, this.defaultTimeoutMs);

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
        detail: `storage bucket "${RAFFLE_IMAGE_BUCKET}" reachable`,
      };
    } catch (err) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        detail: safeProbeDetail(err, 'storage probe failed'),
      };
    }
  }

  private checkNotifications(): Promise<DependencyHealth> {
    const start = Date.now();

    if (!env.notifications.fcmEnabled) {
      return Promise.resolve({
        status: 'skipped',
        latencyMs: Date.now() - start,
        detail: 'FCM disabled',
      });
    }

    return Promise.resolve({
      status: 'ok',
      latencyMs: Date.now() - start,
      detail: 'FCM enabled',
    });
  }
}

export type { HealthResult, LivenessResult, ReadinessResult } from './health.types';
