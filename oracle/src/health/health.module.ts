import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LagMonitorService } from './lag-monitor.service';
import { HeartbeatService } from './heartbeat.service';
import { ContractService } from '../contract/contract.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, LagMonitorService, HeartbeatService, ContractService, TxSubmitterService],
  exports: [HealthService, LagMonitorService, HeartbeatService],
})
export class HealthModule {}
