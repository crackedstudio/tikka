import { Module } from '@nestjs/common';
import { StellarSubscriberService } from './stellar-subscriber.service';
import { HealthModule } from '../health/health.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [HealthModule, MetricsModule],
  providers: [StellarSubscriberService],
  exports: [StellarSubscriberService],
})
export class SubscriberModule {}
