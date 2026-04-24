import { Module } from '@nestjs/common';
import { StellarSubscriberService } from './stellar-subscriber.service';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [HealthModule],
  providers: [StellarSubscriberService],
  exports: [StellarSubscriberService],
})
export class SubscriberModule {}
