import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { NetworkModule } from '../../network/network.module';

@Module({
  imports: [NetworkModule],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
