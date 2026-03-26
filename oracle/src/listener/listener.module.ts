import { Module } from '@nestjs/common';
import { EventListenerService } from './event-listener.service';
import { QueueModule } from '../queue/queue.module';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [QueueModule, ConfigModule, HealthModule],
  providers: [EventListenerService],
  exports: [EventListenerService],
})
export class ListenerModule { }
