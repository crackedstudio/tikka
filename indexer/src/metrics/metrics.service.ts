import { Injectable, Logger } from '@nestjs/common';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Counter, Gauge, Histogram, Meter, ObservableResult } from '@opentelemetry/api';
import { HealthService } from '../health/health.service';
import { DlqReason } from '../database/entities/dead-letter-event.entity';
import { Queue } from 'bullmq';

interface QueueMetricsConfig {
  name: string;
  queue: Queue;
}

@Injectable()
export class MetricsService {
  private meter: Meter;
  private exporter: PrometheusExporter;
  private logger = new Logger(MetricsService.name);

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

  // BullMQ queue metrics
  private queueWaitingGauge: Gauge;
  private queueActiveGauge: Gauge;
  private queueCompletedGauge: Gauge;
  private queueFailedGauge: Gauge;
  private queueDelayedGauge: Gauge;
  private queuePausedGauge: Gauge;
  private queueOldestJobAgeGauge: Gauge;
  private queueTotalGauge: Gauge;

  private queueMetricsIntervals: NodeJS.Timeout[] = [];
  private queues: Map<string, Queue> = new Map();

  constructor(private readonly healthService: HealthService) {
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
      description: 'Current ledger lag behind the network',
    });

    this.indexerLedgerLagGauge = this.meter.createGauge('indexer_ledger_lag', {
      description: 'Number of ledgers the indexer is behind the Stellar network tip',
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

    // Initialize BullMQ queue metrics gauges
    this.queueWaitingGauge = this.meter.createGauge('tikka_indexer_queue_waiting', {
      description: 'Number of jobs waiting in queue',
    });

    this.queueActiveGauge = this.meter.createGauge('tikka_indexer_queue_active', {
      description: 'Number of actively processing jobs',
    });

    this.queueCompletedGauge = this.meter.createGauge('tikka_indexer_queue_completed', {
      description: 'Number of completed jobs',
    });

    this.queueFailedGauge = this.meter.createGauge('tikka_indexer_queue_failed', {
      description: 'Number of failed jobs',
    });

    this.queueDelayedGauge = this.meter.createGauge('tikka_indexer_queue_delayed', {
      description: 'Number of delayed jobs',
    });

    this.queuePausedGauge = this.meter.createGauge('tikka_indexer_queue_paused', {
      description: 'Number of paused jobs',
    });

    this.queueOldestJobAgeGauge = this.meter.createGauge('tikka_indexer_queue_oldest_job_age_seconds', {
      description: 'Age of the oldest waiting job in seconds',
      unit: 's',
    });

    this.queueTotalGauge = this.meter.createGauge('tikka_indexer_queue_total', {
      description: 'Total number of jobs across all states',
    });
  }

  /**
   * Register a BullMQ queue for metrics collection.
   * Call this after the queue is initialized to start collecting queue metrics.
   */
  registerQueue(name: string, queue: Queue): void {
    this.queues.set(name, queue);
    this.logger.log(`Registered queue "${name}" for metrics collection`);
    this.startQueueMetricsCollection(name, queue);
  }

  /**
   * Start periodic metrics collection for a queue.
   * Refreshes every 10 seconds.
   */
  private startQueueMetricsCollection(name: string, queue: Queue): void {
    const collectMetrics = async () => {
      try {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.getPausedCount(),
        ]);

        // Get oldest job timestamp
        let oldestJobAge = 0;
        const waitingJobs = await queue.getJobs(['waiting'], 0, 0);
        if (waitingJobs.length > 0 && waitingJobs[0].timestamp) {
          oldestJobAge = (Date.now() - waitingJobs[0].timestamp) / 1000;
        }

        const labels = { queue: name };

        this.queueWaitingGauge.record(waiting, labels);
        this.queueActiveGauge.record(active, labels);
        this.queueCompletedGauge.record(completed, labels);
        this.queueFailedGauge.record(failed, labels);
        this.queueDelayedGauge.record(delayed, labels);
        this.queuePausedGauge.record(paused, labels);
        this.queueOldestJobAgeGauge.record(oldestJobAge, labels);
        this.queueTotalGauge.record(waiting + active + completed + failed + delayed + paused, labels);
      } catch (error) {
        this.logger.warn(`Failed to collect metrics for queue "${name}": ${error.message}`);
      }
    };

    // Collect immediately
    collectMetrics();

    // Then every 10 seconds
    const interval = setInterval(collectMetrics, 10_000);
    this.queueMetricsIntervals.push(interval);
  }

  /**
   * Stop all queue metrics collection intervals.
   * Call during graceful shutdown.
   */
  stopQueueMetricsCollection(): void {
    for (const interval of this.queueMetricsIntervals) {
      clearInterval(interval);
    }
    this.queueMetricsIntervals = [];
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
    return new Promise((resolve, reject) => {

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
