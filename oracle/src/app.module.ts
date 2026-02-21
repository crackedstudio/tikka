import { Module } from '@nestjs/common';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [QueueModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
