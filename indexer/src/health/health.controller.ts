import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthResult } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}
