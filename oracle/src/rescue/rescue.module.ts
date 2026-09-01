import { RescueDetectorService } from './rescue-detector.service';
import { RescuePlannerService } from './rescue-planner.service';
import { RescueExecutorService } from './rescue-executor.service';
import { Module } from '@nestjs/common';
import { RescueService } from './rescue.service';
import { RescueController } from './rescue.controller';
import { QueueModule } from '../queue/queue.module';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [QueueModule, HealthModule],
  controllers: [RescueController],
  providers: [
    RescueService,
    RescueDetectorService,
    RescuePlannerService,
    RescueExecutorService,
    ContractService,
    VrfService,
    PrngService,
    TxSubmitterService,
  ],
  exports: [RescueService],
})
export class RescueModule {}
