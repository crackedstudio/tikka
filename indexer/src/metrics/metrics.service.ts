import { Injectable, Logger } from '@nestjs/common';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import {
  Counter,
  Gauge,
  Histogram,
  Meter,
  ObservableGauge,
  ObservableResult,
} from '@opentelemetry/api';
import { DlqReason } from '../database/entities/dead-letter-event.entity';
import { CursorManagerService } from '../ingestor/cursor-manager.service';
import { LagProbeService } from './lag-probe.service';
import {
  computeIngestionLagLedgers,
  computeIngestionLagSeconds,
} from './lag-math';

/**
 * Prometheus-facing metrics surface for the indexer service.
 *
 * The canonical ingestion-lag gauges are fed by `LagProbeService`
 * (caches the network tip polled from Horizon) and the cursor's last
 * persisted checkpoint. Math lives in `./lag-math.ts` so it can be
 * exercised independently from the OpenTelemetry wiring and the broken
 * upstream webhook pipeline (issue #1110).
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private meter: Meter;
  private exporter: PrometheusExporter;

  private eventsProcessedCounter: Counter;
  private errorsCounter: Counter;
  private reorgDetectedCounter: Counter;
  private lagGauge: Gauge;
  private indexerLedgerLagGauge: Gauge;
  private pollDurationHistogram: Histogram;
  private slowQueryCounter: Counter;
  private queryDurationHistogram: Histogram;

  private dlqDepthGauge: Gauge;
  private dlqEventsTotalCounter: Counter;

  private ingestionLagLedgersGauge: ObservableGauge;
  private ingestionLagSecondsGauge: ObservableGauge;

  constructor(
    private readonly cursorManager: CursorManagerService,
    private readonly lagProbe: LagProbeService,
  ) {
    // PrometheusExporter automatically initializes the Prometheus registry
    this.exporter = new PrometheusExporter({
      preventServerStart: true,
    });

    const meterProvider = new MeterProvider({
      readers: [this.exporter],
    });

    this.meter = meterProvider.getMeter('tikka-indexer');

    this.eventsProcessedCounter = this.meter.createCounter('tikka_indexer_events_processed_total', {
      description: 'Total number of events processed',
    });

    this.errorsCounter = this.meter.createCounter('tikka_indexer_errors_total', {
      description: 'Total number of errors encountered during polling or processing',
    });

    this.reorgDetectedCounter = this.meter.createCounter('tikka_indexer_reorg_detected_total', {
      description: 'Total number of ledger reorgs detected',
    });

    this.lagGauge = this.meter.createGauge('tikka_indexer_lag_ledgers', {
      description:
        '[Deprecated alias of tikka_indexer_ingestion_lag_ledgers] Current ledger lag behind the Stellar network. Updated opportunistically when the SSE stream falls back to polling; prefer the canonical ingestion_lag_* gauges for new dashboards/alerts.',
    });

    this.indexerLedgerLagGauge = this.meter.createGauge('indexer_ledger_lag', {
      description:
        '[Deprecated alias of tikka_indexer_ingestion_lag_ledgers] Number of ledgers the indexer is behind the Stellar network tip.',
    });

    this.pollDurationHistogram = this.meter.createHistogram('tikka_indexer_poll_duration_seconds', {
      description: 'Duration of ledger polling cycles',
      unit: 's',
    });

    this.slowQueryCounter = this.meter.createCounter('tikka_db_slow_query_total', {
      description: 'Total number of slow database queries detected',
      unit: '1',
    });

    this.queryDurationHistogram = this.meter.createHistogram('tikka_db_query_duration_seconds', {
      description: 'Database query duration in seconds',
      unit: 's',
    });

    this.dlqDepthGauge = this.meter.createGauge('indexer_dlq_depth', {
      description: 'Current DLQ depth (failed events not yet successfully replayed)',
    });

    this.dlqEventsTotalCounter = this.meter.createCounter(
      'indexer_dlq_events_total',
      {
        description:
          'Total number of DLQ events added and replay attempts',
      },
    );

    this.meter.createObservableGauge('tikka_indexer_memory_usage_bytes', {
      description: 'Current memory usage (heapUsed)',
    }).addCallback((result: ObservableResult) => {
      result.observe(process.memoryUsage().heapUsed);
    });

    // Canonical ingestion-lag gauges (issue #1110).
    this.ingestionLagLedgersGauge = this.meter.createObservableGauge(
      'tikka_indexer_ingestion_lag_ledgers',
      {
        description:
          'Ingestion lag in ledgers: latest_network_ledger_sequence - indexer.cursor.lastLedger. Refreshed every LAG_PROBE_REFRESH_MS (default 15000 = 15s) via LagProbeService. Alert when > INDEXER_LAG_ALERT_THRESHOLD_LEDGERS (default 50).',
      },
    );
    this.ingestionLagLedgersGauge.addCallback((result) =>
      result.observe(
        computeIngestionLagLedgers(
          this.lagProbe.getNetworkTip(),
          this.cursorManager.getStatus().lastCheckpoint,
        ),
      ),
    );

    this.ingestionLagSecondsGauge = this.meter.createObservableGauge(
      'tikka_indexer_ingestion_lag_seconds',
      {
        description:
          'Ingestion lag in seconds: latest_network_ledger.closedAt - indexer.cursor.lastSavedAt. Refreshed every LAG_PROBE_REFRESH_MS (default 15000 = 15s) via LagProbeService. Alert when > INDEXER_LAG_ALERT_THRESHOLD_SECONDS (default 90).',
        unit: 's',
      },
    );
    this.ingestionLagSecondsGauge.addCallback((result) =>
      result.observe(
        computeIngestionLagSeconds(
          this.lagProbe.getNetworkTip(),
          this.cursorManager.getStatus().lastCheckpoint,
        ),
      ),
    );
  }

  incrementEventsProcessed(type: string = 'unknown', amount: number = 1) {
    this.eventsProcessedCounter.add(amount, { event_type: type });
  }

  incrementErrors(amount: number = 1) {
    this.errorsCounter.add(amount);
  }

  incrementReorgDetected(amount: number = 1) {
    this.reorgDetectedCounter.add(amount);
  }

  /**
   * Deprecated: prefer the canonical `tikka_indexer_ingestion_lag_ledgers`
   * observable gauge. Retained so callers (e.g. LedgerPollerService) and
   * existing PromQL alerts continue to work without modification.
   */
  setLagLedgers(lag: number) {
    this.lagGauge.record(lag);
    this.indexerLedgerLagGauge.record(lag);
  }

  recordPollDuration(seconds: number) {
    this.pollDurationHistogram.record(seconds);
  }

  recordDatabaseQueryDuration(durationSeconds: number, queryHash: string) {
    this.queryDurationHistogram.record(durationSeconds, { query_hash: queryHash });
  }

  incrementSlowDbQuery(queryHash: string, amount: number = 1) {
    this.slowQueryCounter.add(amount, { query_hash: queryHash });
  }

  setDlqDepth(contractAddress: string, depth: number) {
    this.dlqDepthGauge.record(depth, { contract_address: contractAddress });
  }

  incrementDlqEventsTotal(reason: DlqReason, eventType: string, amount: number = 1) {
    this.dlqEventsTotalCounter.add(amount, { reason, event_type: eventType });
  }

  /**
   * Returns the metrics in Prometheus format.
   * Since PrometheusExporter uses a request/response pattern normally,
   * we simulate it here to get the metrics string.
   */
  async getMetrics(): Promise<string> {
    return new Promise((resolve) => {
      // Use a mock response object to capture the output from the exporter's handler
      const res = {
        setHeader: () => { },
        end: (data: string) => resolve(data),
        statusCode: 200,
      };
      // @ts-ignore - access internal handler
      this.exporter.getMetricsRequestHandler({}, res);
    });
  }
}
