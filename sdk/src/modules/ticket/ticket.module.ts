import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { ContractModule } from '../../contract/contract.module';

@Module({
  imports: [ContractModule],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
