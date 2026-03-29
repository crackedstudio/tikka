import { Injectable } from '@nestjs/common';
import { env } from '../config/env.config';

export interface HealthResult {
  status: 'ok' | 'degraded';
  indexer: 'ok' | 'error';
  supabase: 'ok' | 'error';
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly indexerUrl: string;
  private readonly indexerTimeoutMs: number;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;

  constructor() {
    this.indexerUrl = env.indexer.url.replace(/\/$/, '');
    this.indexerTimeoutMs = env.indexer.timeoutMs;
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

    return { status, indexer, supabase, timestamp: new Date().toISOString() };
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
