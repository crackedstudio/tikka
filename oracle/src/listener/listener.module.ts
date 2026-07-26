import { Module } from '@nestjs/common';
import { EventListenerService } from './event-listener.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { QueueModule } from '../queue/queue.module';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '../health/health.module';
import { PriorityClassifierService } from '../queue/priority-classifier.service';
import { DrawRequestLedgerService } from './draw-request-ledger.service';

@Module({
  imports: [QueueModule, ConfigModule, HealthModule],
  providers: [EventListenerService, CircuitBreakerService, PriorityClassifierService, DrawRequestLedgerService],
  exports: [EventListenerService, CircuitBreakerService, PriorityClassifierService, DrawRequestLedgerService],
})
export class ListenerModule { }
