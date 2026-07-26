import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { env } from '../config/env.config';
import { PushNotificationService, DeliveryMetrics } from '../services/push-notification.service';
import { MaintenanceModeService } from '../maintenance/maintenance-mode.service';

export interface HealthResult {
  status: 'ok' | 'degraded';
  indexer: 'ok' | 'error';
  supabase: 'ok' | 'error';
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
  ) {
    this.indexerUrl = this.config
      .getOrThrow<string>('INDEXER_URL')
      .replace(/\/$/, '');
    this.indexerTimeoutMs = this.config.get<number>('INDEXER_TIMEOUT_MS', 5000);
    this.supabaseUrl = env.supabase.url.replace(/\/$/, '');
    this.supabaseKey = env.supabase.serviceRoleKey;
  }

  async getHealth(): Promise<HealthResult> {
    const [indexerOk, supabaseOk] = await Promise.all([
      this.checkIndexer(),
      this.checkSupabase(),
    ]);

    const indexer: 'ok' | 'error' = indexerOk ? 'ok' : 'error';
    const supabase: 'ok' | 'error' = supabaseOk ? 'ok' : 'error';
    const status: 'ok' | 'degraded' =
      indexer === 'error' || supabase === 'error' ? 'degraded' : 'ok';

    const maintenance = this.maintenanceService.isEnabled();

    return {
      status,
      indexer,
      supabase,
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
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch {
      return false;
    }
  }
}