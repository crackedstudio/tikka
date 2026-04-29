import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';
import { MetadataCacheMetricsService } from '../services/metadata-cache-metrics.service';

@Controller()
export class MetricsController {
  constructor(
    private readonly metadataCacheMetrics: MetadataCacheMetricsService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('metrics')
  getMetrics(): { metadata_cache_hits: number } {
    return {
      metadata_cache_hits:
        this.metadataCacheMetrics.getMetadataCacheHits(),
    };
  }
}
