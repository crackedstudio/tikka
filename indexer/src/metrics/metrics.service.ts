import { Injectable } from '@nestjs/common';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Counter, Meter, ObservableResult } from '@opentelemetry/api';
import { HealthService } from '../health/health.service';

@Injectable()
export class MetricsService {
  private meter: Meter;
  private exporter: PrometheusExporter;

  private eventsProcessedCounter: Counter;
  private errorsCounter: Counter;
  private reorgDetectedCounter: Counter;

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

    this.meter.createObservableGauge('tikka_indexer_lag_ledgers', {
      description: 'Current ledger lag behind the network',
    }).addCallback(async (result: ObservableResult) => {
      const health = await this.healthService.getHealth();
      if (health.lag_ledgers !== null) {
        result.observe(health.lag_ledgers);
      }
    });

    this.meter.createObservableGauge('tikka_indexer_memory_usage_bytes', {
      description: 'Current memory usage (heapUsed)',
    }).addCallback((result: ObservableResult) => {
      result.observe(process.memoryUsage().heapUsed);
    });
  }

  incrementEventsProcessed(amount: number = 1) {
    this.eventsProcessedCounter.add(amount);
  }

  incrementErrors(amount: number = 1) {
    this.errorsCounter.add(amount);
  }

  incrementReorgDetected(amount: number = 1) {
    this.reorgDetectedCounter.add(amount);
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
