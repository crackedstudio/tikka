import { Module } from '@nestjs/common';
import { RaffleService } from './raffle.service';

@Module({
  providers: [RaffleService],
  exports: [RaffleService],
})
export class RaffleModule {}
