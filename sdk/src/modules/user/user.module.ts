import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { ContractModule } from '../../contract/contract.module';

@Module({
  imports: [ContractModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
