import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthResult, LivenessResult, ReadinessResult } from './health.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';
import { SkipMaintenance } from '../maintenance/skip-maintenance.decorator';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @SkipMaintenance()
  @Get('health')
  async getHealth(): Promise<HealthResult> {
    const result = await this.healthService.getHealth();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Public()
  @SkipThrottle()
  @SkipMaintenance()
  @Get('health/live')
  async getLiveness(): Promise<LivenessResult> {
    return this.healthService.getLiveness();
  }

  @Public()
  @SkipThrottle()
  @SkipMaintenance()
  @Get('health/ready')
  async getReadiness(): Promise<ReadinessResult> {
    const result = await this.healthService.getReadiness();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
