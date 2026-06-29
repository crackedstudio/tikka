import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetadataService } from './metadata.service';
import { MetadataRedisService } from './metadata-redis.service';
import { MetadataCacheMetricsService } from './metadata-cache-metrics.service';
import { PinningService } from './pinning.service';

@Module({
  imports: [ConfigModule],
  providers: [
    MetadataRedisService,
    MetadataCacheMetricsService,
    PinningService,
    MetadataService,
  ],
  exports: [MetadataService, MetadataCacheMetricsService, PinningService],
})
export class MetadataModule {}
