import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LagMonitorService } from './lag-monitor.service';
import { HeartbeatService } from './heartbeat.service';
import { AlertingService } from './alerting.service';
import { ContractService } from '../contract/contract.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { FeeEstimatorService } from '../submitter/fee-estimator.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, LagMonitorService, HeartbeatService, AlertingService, ContractService, TxSubmitterService, FeeEstimatorService],
  exports: [HealthService, LagMonitorService, HeartbeatService, AlertingService],
})
export class HealthModule {}
