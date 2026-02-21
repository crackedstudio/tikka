import { Module } from '@nestjs/common';
import { UserModule } from './modules/user/user.module';
import { TicketModule } from './modules/ticket/ticket.module';

@Module({
  imports: [UserModule, TicketModule],
  controllers: [],
  providers: [],
  exports: [UserModule, TicketModule],
})
export class AppModule {}
