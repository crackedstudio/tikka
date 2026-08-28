import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  // Registry can be the default global registry
  private readonly registry = new Registry();

  readonly imageCacheHit: Counter<string> = new Counter({
    name: 'image_cache_hit_total',
    help: 'Total number of image cache hits',
    registers: [this.registry],
  });

  readonly imageCacheMiss: Counter<string> = new Counter({
    name: 'image_cache_miss_total',
    help: 'Total number of image cache misses',
    registers: [this.registry],
  });

  readonly imageVariantGenerated: Counter<string> = new Counter({
    name: 'image_variant_generated_total',
    help: 'Total number of image variants generated',
    registers: [this.registry],
  });

  readonly imageProcessingFailures: Counter<string> = new Counter({
    name: 'image_processing_failures_total',
    help: 'Total number of image processing failures',
    registers: [this.registry],
  });

  // Expose metrics endpoint data
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  onModuleInit() {
    // Register default metrics (process, heap, etc.)
    // This is optional but useful for observability
    // import inside to avoid eager import if library missing
    const { collectDefaultMetrics } = require('prom-client');
    collectDefaultMetrics({ register: this.registry });
  }
}
