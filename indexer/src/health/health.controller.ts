import { Controller, Get, ServiceUnavailableException, Optional } from '@nestjs/common';
import { HealthService, HealthResult, LivenessResult } from './health.service';
import { DlqService } from '../ingestor/dlq.service';
import { PipelineStateSnapshot } from '../ingestor/pipeline-state';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    @Optional() private readonly dlqService?: DlqService,
  ) {}

  /**
   * Liveness probe — process is alive.
   * Always 200 while the Nest process can serve HTTP. Does not fail on
   * lag, DLQ pressure, Redis, or stalled ingestion (those are readiness).
   */
  @Get('health/live')
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness probe — safe to receive traffic.
   * Returns 200 when dependencies and ingestion are healthy, 503 when
   * degraded (DB/Redis down, cursor integrity failed, lag/heartbeat stall, etc.).
   */
  @Get('health/ready')
  async getReadiness(): Promise<HealthResult> {
    const result = await this.healthService.getReadiness();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  /**
   * Full health diagnostics (same payload / 503 semantics as readiness).
   * Kept for CLI, metrics scrape helpers, and backwards compatibility.
   */
  @Get('health')
  async getHealth(): Promise<HealthResult> {
    const result = await this.healthService.getHealth();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  /**
   * GET /health/dlq-size — returns the count of events in the DLQ.
   * Used for alerting and monitoring.
   */
  @Get('health/dlq-size')
  async getDlqSize(): Promise<{ dlq_size: number }> {
    const dlq_size = this.dlqService ? await this.dlqService.count() : 0;
    return { dlq_size };
  }

  /**
   * GET /health/pipeline — returns the current ingestion pipeline state so
   * operators can inspect what the indexer is doing (polling, parsing,
   * dispatching, updating cursor, dead-letter, rolling back, shutting down).
   */
  @Get('health/pipeline')
  getPipeline(): { pipeline: PipelineStateSnapshot | null } {
    return { pipeline: this.healthService.getPipelineState() };
  }
}
