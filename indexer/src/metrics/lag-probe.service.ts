import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NetworkTip {
  /**
   * Latest ledger sequence observed on the Stellar network. `null` while the
   * probe has not yet completed its first successful fetch.
   */
  sequence: number | null;
  /**
   * `closed_at` of the latest network ledger (UTC). `null` until the first
   * successful fetch (or when Horizon omits `closed_at` in test responses).
   */
  closedAt: Date | null;
  /**
   * Wall-clock time at which this tip was last refreshed.
   */
  observedAt: Date;
}

const DEFAULT_REFRESH_MS = 15_000;
const DEFAULT_FETCH_TIMEOUT_MS = 4_000;

interface HorizonLedgerRecord {
  sequence: string | number;
  closed_at?: string;
}

interface HorizonLedgerResponse {
  _embedded?: { records?: HorizonLedgerRecord[] };
}

/**
 * Background poller that keeps a cached view of the Stellar network tip so
 * observability scrapes never block on a network round-trip.
 *
 * Used by `MetricsService` to feed `tikka_indexer_ingestion_lag_ledgers`
 * and `tikka_indexer_ingestion_lag_seconds`.
 */
@Injectable()
export class LagProbeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LagProbeService.name);
  private readonly horizonUrl: string;
  private readonly refreshMs: number;
  private readonly fetchTimeoutMs: number;

  private cachedTip: NetworkTip = {
    sequence: null,
    closedAt: null,
    observedAt: new Date(0),
  };
  private interval?: NodeJS.Timeout;
  private inFlight = false;

  constructor(private readonly configService: ConfigService) {
    this.horizonUrl = (
      this.configService.get<string>('HORIZON_URL') ??
      'https://horizon-testnet.stellar.org'
    ).replace(/\/$/, '');
    this.refreshMs =
      this.configService.get<number>('LAG_PROBE_REFRESH_MS') ??
      DEFAULT_REFRESH_MS;
    this.fetchTimeoutMs =
      this.configService.get<number>('LAG_PROBE_TIMEOUT_MS') ??
      DEFAULT_FETCH_TIMEOUT_MS;
  }

  async onModuleInit(): Promise<void> {
    // Best-effort synchronous kick-off so the very first scrape has a chance
    // of returning a non-null lag value.
    void this.refresh();
    this.interval = setInterval(() => {
      void this.refresh();
    }, this.refreshMs);
    this.logger.log(
      `LagProbe started; refreshing network tip every ${this.refreshMs}ms from ${this.horizonUrl}`,
    );
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Returns the most-recent network ledger tip seen by the probe. Safe to
   * call from synchronous code paths (e.g. ObservableGauge callbacks).
   */
  getNetworkTip(): NetworkTip {
    return this.cachedTip;
  }

  /**
   * Forces a refresh. Public so tests and operator scripts can trigger an
   * out-of-band update without waiting for the timer.
   */
  async refresh(): Promise<void> {
    if (this.inFlight) {
      // Avoid stacking requests if Horizon is slow: the previous call will
      // already populate the cache.
      return;
    }
    this.inFlight = true;
    try {
      const tip = await this.fetchLatestLedger();
      if (tip) {
        this.cachedTip = tip;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to refresh network tip: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.inFlight = false;
    }
  }

  private async fetchLatestLedger(): Promise<NetworkTip | null> {
    const url = `${this.horizonUrl}/ledgers?order=desc&limit=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      this.logger.debug(`Horizon returned ${res.status} for ${url}`);
      return null;
    }
    const body = (await res.json()) as HorizonLedgerResponse;
    const record = body._embedded?.records?.[0];
    if (!record) {
      return null;
    }
    const sequence = Number(record.sequence);
    if (!Number.isFinite(sequence)) {
      return null;
    }
    const closedAt = record.closed_at ? new Date(record.closed_at) : null;
    return {
      sequence,
      closedAt: closedAt && !Number.isNaN(closedAt.getTime()) ? closedAt : null,
      observedAt: new Date(),
    };
  }
}
