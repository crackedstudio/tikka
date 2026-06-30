import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipThrottle } from '../middleware/throttle.decorator';
import { MetadataCacheMetricsService } from '../services/metadata-cache-metrics.service';
import { SkipMaintenance } from '../maintenance/skip-maintenance.decorator';

@Controller()
export class MetricsController {
  constructor(
    private readonly metadataCacheMetrics: MetadataCacheMetricsService,
  ) {}

  @Public()
  @SkipThrottle()
  @SkipMaintenance()
  @Get('metrics')
  getMetrics(): { metadata_cache_hits: number } {
    return {
      metadata_cache_hits:
        this.metadataCacheMetrics.getMetadataCacheHits(),
    };
  }
}
