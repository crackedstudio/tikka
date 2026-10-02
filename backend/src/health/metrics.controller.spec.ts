import { MetricsController } from './metrics.controller';
import { MetadataCacheMetricsService } from '../services/metadata/metadata-cache-metrics.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('MetricsController', () => {
  it('exposes metadata cache hit counter', () => {
    const metrics = new MetadataCacheMetricsService();
    metrics.recordMetadataCacheHit();
    metrics.recordMetadataCacheHit();

    const controller = new MetricsController(metrics);
    expect(controller.getMetrics()).toEqual({ metadata_cache_hits: 2 });
  });

  it('keeps the emitted cache metric aligned with the observability map', () => {
    const metricsMap = readFileSync(
      resolve(__dirname, '../../../docs/observability/METRICS_MAP.md'),
      'utf8',
    );
    const documentedCacheMetrics = [...metricsMap.matchAll(
      /^\|\s*`([^`]+)`\s*\|\s*Counter\s*\|\s*`MetadataCacheMetricsService`\s*\|/gm,
    )].map((match) => match[1]);

    expect(documentedCacheMetrics).toEqual(['metadata_cache_hits']);
    expect(Object.keys(new MetricsController(new MetadataCacheMetricsService()).getMetrics()))
      .toEqual(documentedCacheMetrics);
  });
});
