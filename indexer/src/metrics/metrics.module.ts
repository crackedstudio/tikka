import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { LagProbeService } from './lag-probe.service';
import { HealthModule } from '../health/health.module';
import { IngestorModule } from '../ingestor/ingestor.module';

@Global()
@Module({
  imports: [HealthModule, IngestorModule],
  providers: [MetricsService, LagProbeService],
  controllers: [MetricsController],
  exports: [MetricsService, LagProbeService],
})
export class MetricsModule {}
