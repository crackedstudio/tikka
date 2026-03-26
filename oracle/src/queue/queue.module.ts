import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RandomnessWorker } from './randomness.worker';
import { CommitRevealWorker } from './commit-reveal.worker';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { CommitmentService } from '../randomness/commitment.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthModule } from '../health/health.module';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { RANDOMNESS_QUEUE } from './randomness.queue';

@Module({
  imports: [
    HealthModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: RANDOMNESS_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    }),
  ],
  providers: [
    RandomnessWorker,
    CommitRevealWorker,
    ContractService,
    VrfService,
    PrngService,
    CommitmentService,
    TxSubmitterService,
    HealthService,
    LagMonitorService,
  ],
  exports: [RandomnessWorker, CommitRevealWorker, BullModule],
})
export class QueueModule { }
