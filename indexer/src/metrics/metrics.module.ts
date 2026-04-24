import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HealthModule } from '../health/health.module';
import { IngestorModule } from '../ingestor/ingestor.module';

@Global()
@Module({
  imports: [HealthModule, IngestorModule],
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
