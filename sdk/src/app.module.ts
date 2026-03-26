import { Module } from '@nestjs/common';
import { UserModule } from './modules/user/user.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { NetworkModule } from './network/network.module';
import { ContractModule } from './contract/contract.module';

@Module({
  imports: [NetworkModule, ContractModule, UserModule, TicketModule],
  controllers: [],
  providers: [],
  exports: [UserModule, TicketModule],
})
export class AppModule {}
