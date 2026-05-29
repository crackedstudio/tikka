import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsController } from './metrics.controller';
import { MetadataModule } from '../services/metadata.module';

@Module({
  imports: [MetadataModule],
  controllers: [HealthController, MetricsController],
  providers: [HealthService],
})
export class HealthModule {}
