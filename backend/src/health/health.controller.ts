import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthResult } from './health.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get('health')
  async getHealth(): Promise<HealthResult> {
    const result = await this.healthService.getHealth();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
