import { Module } from '@nestjs/common';
import { RaffleProcessor } from './raffle.processor';
import { UserProcessor } from './user.processor';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [CacheModule],
  providers: [RaffleProcessor, UserProcessor],
  exports: [RaffleProcessor, UserProcessor],
})
export class ProcessorsModule {}
