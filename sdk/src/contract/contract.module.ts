import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { TxLifecycleService } from './tx-lifecycle.service';

@Module({
  providers: [ContractService, TxLifecycleService],
  exports: [ContractService],
})
export class ContractModule {}
