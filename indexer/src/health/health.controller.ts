import { Controller, Get, ServiceUnavailableException, Optional } from '@nestjs/common';
import { HealthService, HealthResult } from './health.service';
import { DlqService } from '../ingestor/dlq.service';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    @Optional() private readonly dlqService?: DlqService,
  ) {}

  /**
   * Health endpoint for orchestration and monitoring.
   * Returns 200 when status is 'ok', 503 when 'degraded' (e.g. lag over threshold or DB/Redis down).
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
}
