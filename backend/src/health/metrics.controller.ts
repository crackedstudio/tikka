import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';
import { MetadataCacheMetricsService } from '../services/metadata-cache-metrics.service';

@ApiTags('Metrics')
@Controller()
export class MetricsController {
  constructor(
    private readonly metadataCacheMetrics: MetadataCacheMetricsService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('metrics')
  @ApiOperation({ summary: 'Get backend metrics' })
  @ApiResponse({ status: 200, description: 'Backend metrics retrieved successfully' })
  getMetrics(): { metadata_cache_hits: number } {
    return {
      metadata_cache_hits:
        this.metadataCacheMetrics.getMetadataCacheHits(),
    };
  }
}
