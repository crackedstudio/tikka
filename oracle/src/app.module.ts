import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { SubscriberModule } from './subscriber/subscriber.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueueModule,
    HealthModule,
    SubscriberModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
