import { Module } from '@nestjs/common';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
