import { Module } from '@nestjs/common';
import { RandomnessWorker } from './randomness.worker';
import { CommitRevealWorker } from './commit-reveal.worker';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { CommitmentService } from '../randomness/commitment.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Module({
  providers: [
    RandomnessWorker,
    CommitRevealWorker,
    ContractService,
    VrfService,
    PrngService,
    CommitmentService,
    TxSubmitterService,
  ],
  exports: [RandomnessWorker, CommitRevealWorker],
})
export class QueueModule {}
