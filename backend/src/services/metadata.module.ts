import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetadataService } from './metadata.service';
import { MetadataRedisService } from './metadata-redis.service';
import { MetadataCacheMetricsService } from './metadata-cache-metrics.service';

@Module({
  imports: [ConfigModule],
  providers: [
    MetadataRedisService,
    MetadataCacheMetricsService,
    MetadataService,
  ],
  exports: [MetadataService, MetadataCacheMetricsService],
})
export class MetadataModule {}
