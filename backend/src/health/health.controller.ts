import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthService,
  HealthResult,
  LivenessResult,
  ReadinessResult,
} from './health.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipThrottle()
  @Get('health/live')
  @ApiOperation({ summary: 'Kubernetes liveness probe — process is running' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  getLiveness(): LivenessResult {
    return this.healthService.getLiveness();
  }

  @Public()
  @SkipThrottle()
  @Get('health/ready')
  @ApiOperation({
    summary: 'Kubernetes readiness probe — critical dependencies are healthy',
  })
  @ApiResponse({ status: 200, description: 'Ready to receive traffic' })
  @ApiResponse({
    status: 503,
    description: 'One or more critical dependencies are unavailable',
  })
  async getReadiness(): Promise<ReadinessResult> {
    const result = await this.healthService.getReadiness();
    if (result.status === 'not_ready') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Public()
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'Detailed dependency health for operators' })
  @ApiResponse({ status: 200, description: 'All critical dependencies healthy' })
  @ApiResponse({
    status: 503,
    description: 'One or more critical dependencies are unhealthy',
  })
  async getHealth(): Promise<HealthResult> {
    const result = await this.healthService.getHealth();
    if (result.status === 'unhealthy') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
