import { Module, Global } from '@nestjs/common';
import { ContractService } from './contract.service';
import { NetworkModule } from '../network/network.module';

@Global()
@Module({
  imports: [NetworkModule],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
