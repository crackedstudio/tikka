import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, HealthResult } from './health.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'Get backend health status' })
  @ApiResponse({ status: 200, description: 'Backend dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more backend dependencies are degraded' })
  async getHealth(): Promise<HealthResult> {
    const result = await this.healthService.getHealth();
    if (result.status === 'degraded') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
