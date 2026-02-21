import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { ContractService } from '../../contract/contract.service';

@Module({
  providers: [TicketService, ContractService],
  exports: [TicketService],
})
export class TicketModule {}
