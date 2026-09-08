import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketReadService } from './ticket.read.service';

@Module({
  providers: [TicketService, TicketReadService],
  exports: [TicketService, TicketReadService],
})
export class TicketModule {}