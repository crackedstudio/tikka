import { Module } from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { FeeEstimatorModule } from '../../fee-estimator/fee-estimator.module';

@Module({
  imports: [FeeEstimatorModule],
  providers: [RaffleService],
  exports: [RaffleService],
})
export class RaffleModule {}
