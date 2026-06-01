import { Injectable, OnModuleInit } from '@nestjs/common';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Counter, Gauge, Meter, ObservableResult } from '@opentelemetry/api';

@Injectable()
export class MetricsService implements OnModuleInit {
  private meter: Meter;
  private exporter: PrometheusExporter;

  // Cost metrics
  private estimatedFeeGauge: Gauge;
  private actualFeeCounter: Counter;
  private submissionOutcomeCounter: Counter;

  constructor() {
    this.exporter = new PrometheusExporter({
      preventServerStart: true,
    });

    const meterProvider = new MeterProvider({
      readers: [this.exporter],
    });

    this.meter = meterProvider.getMeter('tikka-oracle');

    // Estimated fee for the next submission or average estimated monthly cost
    this.estimatedFeeGauge = this.meter.createGauge('tikka_oracle_estimated_fee_stroops', {
      description: 'Estimated fee for the next submission in stroops',
    });

    // Actual fee paid for successful submissions
    this.actualFeeCounter = this.meter.createCounter('tikka_oracle_actual_fee_total_stroops', {
      description: 'Total actual fee paid for submissions in stroops',
    });

    // Submission outcomes (success, failure, retry)
    this.submissionOutcomeCounter = this.meter.createCounter('tikka_oracle_submission_outcome_total', {
      description: 'Total number of submissions by outcome',
    });

    // Standard metrics
    this.meter.createObservableGauge('tikka_oracle_memory_usage_bytes', {
      description: 'Current memory usage (heapUsed)',
    }).addCallback((result: ObservableResult) => {
      result.observe(process.memoryUsage().heapUsed);
    });
  }

  onModuleInit() {
    // Initialization logic if needed
  }

  recordEstimatedFee(fee: number, network: string, method: string) {
    this.estimatedFeeGauge.record(fee, { network, method });
  }

  recordActualFee(fee: number, network: string, method: string, raffleId: number) {
    // Note: raffleId is high cardinality, so we avoid using it as a label
    // unless strictly necessary. The requirement says "Ensure labels avoid high-cardinality secrets".
    // raffleId is not a secret, but it is high cardinality.
    this.actualFeeCounter.add(fee, { network, method });
  }

  recordSubmissionOutcome(outcome: 'success' | 'failure' | 'retry', network: string, method: string) {
    this.submissionOutcomeCounter.add(1, { outcome, network, method });
  }

  /**
   * Returns the metrics in Prometheus format.
   */
  async getMetrics(): Promise<string> {
    return new Promise((resolve) => {
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
