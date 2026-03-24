import { Module } from '@nestjs/common';
import { ContractModule } from './contract/contract.module';
import { UserModule } from './modules/user/user.module';
import { TicketModule } from './modules/ticket/ticket.module';

@Module({
  imports: [ContractModule, UserModule, TicketModule],
  exports: [ContractModule, UserModule, TicketModule],
})
export class AppModule {}
