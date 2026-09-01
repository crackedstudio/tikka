import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { FeeStrategyService } from '../submitter/fee-strategy';
import { FeeEstimatorService } from '../submitter/fee-estimator.service';
import { AdminController } from './admin.controller';
import { AdminApiKeyGuard } from './admin-api-key.guard';

@Module({
  imports: [MetricsModule],
  controllers: [AdminController],
  providers: [AdminApiKeyGuard, FeeStrategyService, FeeEstimatorService],
})
export class AdminModule {}
