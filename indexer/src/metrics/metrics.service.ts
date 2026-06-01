import { Injectable } from '@nestjs/common';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Counter, Gauge, Histogram, Meter, ObservableResult } from '@opentelemetry/api';
import { HealthService } from '../health/health.service';

@Injectable()
export class MetricsService {
  private meter: Meter;
  private exporter: PrometheusExporter;

  // Event processing metrics
  private eventsProcessedCounter: Counter;
  private eventsFailedCounter: Counter;
  private errorsCounter: Counter;
  
  // Lag and reorg metrics
  private reorgDetectedCounter: Counter;
  private lagGauge: Gauge;
  private pollDurationHistogram: Histogram;
  
  // Database metrics
  private slowQueryCounter: Counter;
  private queryDurationHistogram: Histogram;
  private dbLatencyHistogram: Histogram;
  
  // Cache metrics
  private cacheHitsCounter: Counter;
  private cacheMissesCounter: Counter;
  private cacheLatencyHistogram: Histogram;
  
  // Queue and DLQ metrics
  private dlqMessagesCounter: Counter;
  private retriesCounter: Counter;
  private queueDepthGauge: Gauge;

  constructor(private readonly healthService: HealthService) {
    // PrometheusExporter automatically initializes the Prometheus registry
    this.exporter = new PrometheusExporter({
      preventServerStart: true,
    });

    const meterProvider = new MeterProvider({
      readers: [this.exporter],
    });

    this.meter = meterProvider.getMeter('tikka-indexer');

    // Event processing metrics with labels for event_type and outcome
    this.eventsProcessedCounter = this.meter.createCounter('tikka_indexer_events_processed_total', {
      description: 'Total number of events processed by type and outcome',
    });

    this.eventsFailedCounter = this.meter.createCounter('tikka_indexer_events_failed_total', {
      description: 'Total number of events that failed processing by type',
    });

    this.errorsCounter = this.meter.createCounter('tikka_indexer_errors_total', {
      description: 'Total number of errors encountered during polling or processing by type',
    });

    // Lag and reorg metrics
    this.reorgDetectedCounter = this.meter.createCounter('tikka_indexer_reorg_detected_total', {
      description: 'Total number of ledger reorgs detected',
    });

    this.lagGauge = this.meter.createGauge('tikka_indexer_lag_ledgers', {
      description: 'Current ledger lag behind the network',
    });

    this.pollDurationHistogram = this.meter.createHistogram('tikka_indexer_poll_duration_seconds', {
      description: 'Duration of ledger polling cycles',
      unit: 's',
    });

    // Database metrics
    this.slowQueryCounter = this.meter.createCounter('tikka_db_slow_query_total', {
      description: 'Total number of slow database queries detected by operation',
      unit: '1',
    });

    this.queryDurationHistogram = this.meter.createHistogram('tikka_db_query_duration_seconds', {
      description: 'Database query duration in seconds by operation',
      unit: 's',
    });

    this.dbLatencyHistogram = this.meter.createHistogram('tikka_db_latency_seconds', {
      description: 'Database operation latency in seconds by operation type',
      unit: 's',
    });

    // Cache metrics
    this.cacheHitsCounter = this.meter.createCounter('tikka_cache_hits_total', {
      description: 'Total number of cache hits by cache type',
    });

    this.cacheMissesCounter = this.meter.createCounter('tikka_cache_misses_total', {
      description: 'Total number of cache misses by cache type',
    });

    this.cacheLatencyHistogram = this.meter.createHistogram('tikka_cache_latency_seconds', {
      description: 'Cache operation latency in seconds by operation and cache type',
      unit: 's',
    });

    // Queue and DLQ metrics
    this.dlqMessagesCounter = this.meter.createCounter('tikka_dlq_messages_total', {
      description: 'Total number of messages sent to dead letter queue by queue name',
    });

    this.retriesCounter = this.meter.createCounter('tikka_retries_total', {
      description: 'Total number of retry attempts by queue name and event type',
    });

    this.queueDepthGauge = this.meter.createGauge('tikka_queue_depth', {
      description: 'Current queue depth by queue name',
    });

    // Observable metrics
    this.meter.createObservableGauge('tikka_indexer_memory_usage_bytes', {
      description: 'Current memory usage (heapUsed)',
    }).addCallback((result: ObservableResult) => {
      result.observe(process.memoryUsage().heapUsed);
    });
  }

  incrementEventsProcessed(type: string = 'unknown', outcome: string = 'success', amount: number = 1) {
    this.eventsProcessedCounter.add(amount, { event_type: type, outcome });
  }

  incrementEventsFailed(type: string = 'unknown', amount: number = 1) {
    this.eventsFailedCounter.add(amount, { event_type: type });
  }

  incrementErrors(errorType: string = 'unknown', amount: number = 1) {
    this.errorsCounter.add(amount, { error_type: errorType });
  }

  incrementReorgDetected(amount: number = 1) {
    this.reorgDetectedCounter.add(amount);
  }

  setLagLedgers(lag: number) {
    this.lagGauge.record(lag);
  }

  recordPollDuration(seconds: number) {
    this.pollDurationHistogram.record(seconds);
  }

  recordDatabaseQueryDuration(durationSeconds: number, operation: string) {
    this.queryDurationHistogram.record(durationSeconds, { operation });
  }

  recordDatabaseLatency(durationSeconds: number, operationType: string) {
    this.dbLatencyHistogram.record(durationSeconds, { operation_type: operationType });
  }

  incrementSlowDbQuery(operation: string, amount: number = 1) {
    this.slowQueryCounter.add(amount, { operation });
  }

  // Cache metrics methods
  incrementCacheHits(cacheType: string = 'default', amount: number = 1) {
    this.cacheHitsCounter.add(amount, { cache_type: cacheType });
  }

  incrementCacheMisses(cacheType: string = 'default', amount: number = 1) {
    this.cacheMissesCounter.add(amount, { cache_type: cacheType });
  }

  recordCacheLatency(durationSeconds: number, operation: string, cacheType: string = 'default') {
    this.cacheLatencyHistogram.record(durationSeconds, { operation, cache_type: cacheType });
  }

  // Queue and DLQ metrics methods
  incrementDlqMessages(queueName: string, amount: number = 1) {
    this.dlqMessagesCounter.add(amount, { queue_name: queueName });
  }

  incrementRetries(queueName: string, eventType: string = 'unknown', amount: number = 1) {
    this.retriesCounter.add(amount, { queue_name: queueName, event_type: eventType });
  }

  setQueueDepth(queueName: string, depth: number) {
    this.queueDepthGauge.record(depth, { queue_name: queueName });
  }

  /**
   * Returns the metrics in Prometheus format.
   * Since PrometheusExporter uses a request/response pattern normally,
   * we simulate it here to get the metrics string.
   */
  async getMetrics(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use a mock response object to capture the output from the exporter's handler
      const res = {
        setHeader: () => {},
        end: (data: string) => resolve(data),
        statusCode: 200,
      };
      // @ts-ignore - access internal handler
      this.exporter.getMetricsRequestHandler({}, res);
    });
  }
}
