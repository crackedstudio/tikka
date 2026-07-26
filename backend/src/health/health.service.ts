import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { env } from '../config/env.config';
import { PushNotificationService, DeliveryMetrics } from '../services/push-notification.service';
import { MaintenanceModeService } from '../maintenance/maintenance-mode.service';

export interface DependencyStatus {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export interface HealthResult {
  status: 'ok' | 'degraded';
  dependencies: DependencyStatus[];
  timestamp: string;
  maintenance?: boolean;
}

export interface LivenessResult {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  dependencies: DependencyStatus[];
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly indexerUrl: string;
  private readonly indexerTimeoutMs: number;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;
  private readonly redisUrl: string | undefined;
  private readonly redisTimeoutMs: number;
  private readonly dbConnectionString: string | undefined;
  private readonly dbTimeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly maintenanceService: MaintenanceModeService,
  ) {
    this.indexerUrl = this.config
      .getOrThrow<string>('INDEXER_URL')
      .replace(/\/$/, '');
    this.indexerTimeoutMs = this.config.get<number>('INDEXER_TIMEOUT_MS', 5000);
    this.supabaseUrl = env.supabase.url.replace(/\/$/, '');
    this.supabaseKey = env.supabase.serviceRoleKey;
    this.redisUrl = this.config.get<string>('REDIS_URL');
    this.redisTimeoutMs = this.config.get<number>('REDIS_TIMEOUT_MS', 2000);
    this.dbConnectionString = this.config.get<string>('DATABASE_URL');
    this.dbTimeoutMs = this.config.get<number>('DB_TIMEOUT_MS', 3000);
  }

  async getLiveness(): Promise<LivenessResult> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResult> {
    const dependencies = await this.checkAllDependencies();
    const hasError = dependencies.some(dep => dep.status === 'error');
    const status: 'ok' | 'degraded' = hasError ? 'degraded' : 'ok';

    return {
      status,
      dependencies,
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth(): Promise<HealthResult> {
    const readiness = await this.getReadiness();
    const maintenance = this.maintenanceService.isEnabled();

    return {
      status: readiness.status,
      dependencies: readiness.dependencies,
      timestamp: readiness.timestamp,
      ...(maintenance && { maintenance }),
    };
  }

  private async checkAllDependencies(): Promise<DependencyStatus[]> {
    const checks = [
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSupabase(),
      this.checkIndexer(),
      this.checkEmailProvider(),
    ];

    const results = await Promise.all(checks);
    return results.filter((result): result is DependencyStatus => result !== null);
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      if (!this.dbConnectionString) {
        return {
          name: 'database',
          status: 'ok',
          latencyMs: 0,
          error: 'DATABASE_URL not configured',
        };
      }

      // Try to connect to PostgreSQL with a short timeout
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: this.dbConnectionString,
        connectTimeoutMillis: this.dbTimeoutMs,
      });

      await client.connect();
      await client.query('SELECT 1');
      await client.end();

      return {
        name: 'database',
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        name: 'database',
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message || 'Connection failed',
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      if (!this.redisUrl) {
        return {
          name: 'redis',
          status: 'ok',
          latencyMs: 0,
          error: 'REDIS_URL not configured',
        };
      }

      // Try to connect to Redis with a short timeout
      const { createClient } = await import('redis');
      const client = createClient({
        url: this.redisUrl,
        socket: {
          connectTimeout: this.redisTimeoutMs,
        },
      });

      await client.connect();
      await client.ping();
      await client.disconnect();

      return {
        name: 'redis',
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        name: 'redis',
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message || 'Connection failed',
      };
    }
  }

  /**
   * Lightweight Supabase reachability check via the REST endpoint.
   * Any HTTP response (including 401) means reachable.
   * Only network failures or timeouts are treated as errors.
   */
  private async checkSupabase(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
        },
        signal: AbortSignal.timeout(3000),
      });

      return {
        name: 'supabase',
        status: res.ok ? 'ok' : 'error',
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (error: any) {
      return {
        name: 'supabase',
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message || 'Connection failed',
      };
    }
  }

  /**
   * Ping the indexer's own health endpoint.
   * Returns true if it responds within the timeout.
   */
  private async checkIndexer(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.indexerUrl}/health`, {
        signal: AbortSignal.timeout(this.indexerTimeoutMs),
      });

      return {
        name: 'indexer',
        status: res.ok ? 'ok' : 'error',
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (error: any) {
      return {
        name: 'indexer',
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message || 'Connection failed',
      };
    }
  }

  /**
   * Check email provider availability.
   * For now, just checks if email credentials are configured.
   */
  private async checkEmailProvider(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const emailProvider = this.config.get<string>('EMAIL_PROVIDER');
      const sendgridApiKey = this.config.get<string>('SENDGRID_API_KEY');
      const awsAccessKey = this.config.get<string>('AWS_ACCESS_KEY_ID');

      const hasEmailConfig = emailProvider || sendgridApiKey || awsAccessKey;

      return {
        name: 'email',
        status: hasEmailConfig ? 'ok' : 'error',
        latencyMs: Date.now() - start,
        error: hasEmailConfig ? undefined : 'No email provider configured',
      };
    } catch (error: any) {
      return {
        name: 'email',
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message || 'Configuration error',
      };
    }
  }
}