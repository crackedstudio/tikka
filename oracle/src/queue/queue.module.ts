import { Module } from '@nestjs/common';
import { RandomnessWorker } from './randomness.worker';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';

@Module({
  providers: [
    RandomnessWorker,
    ContractService,
    VrfService,
    PrngService,
    TxSubmitterService,
  ],
  exports: [RandomnessWorker],
})
export class QueueModule {}
