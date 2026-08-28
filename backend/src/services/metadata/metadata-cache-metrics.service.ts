import { Injectable } from '@nestjs/common';

/** In-process counters for observability (exposed via GET /metrics). */
@Injectable()
export class MetadataCacheMetricsService {
  private metadataCacheHits = 0;

  recordMetadataCacheHit(): void {
    this.metadataCacheHits += 1;
  }

  getMetadataCacheHits(): number {
    return this.metadataCacheHits;
  }
}
