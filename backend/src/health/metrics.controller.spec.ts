import { MetricsController } from './metrics.controller';
import { MetadataCacheMetricsService } from '../services/metadata-cache-metrics.service';

describe('MetricsController', () => {
  it('exposes metadata cache hit counter', () => {
    const metrics = new MetadataCacheMetricsService();
    metrics.recordMetadataCacheHit();
    metrics.recordMetadataCacheHit();

    const controller = new MetricsController(metrics);
    expect(controller.getMetrics()).toEqual({ metadata_cache_hits: 2 });
  });
});
