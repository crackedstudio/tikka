import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { ContractService } from '../../contract/contract.service';

@Module({
  providers: [UserService, ContractService],
  exports: [UserService],
})
export class UserModule {}
