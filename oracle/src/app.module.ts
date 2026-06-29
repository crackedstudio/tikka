import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { SubscriberModule } from './subscriber/subscriber.module';
import { ListenerModule } from './listener/listener.module';
import { KeysModule } from './keys/keys.module';
import { MultiOracleModule } from './multi-oracle/multi-oracle.module';
import { RescueModule } from './rescue/rescue.module';
import { AuditLogModule } from './audit/audit.module';
import { MetricsModule } from './metrics/metrics.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KeysModule,
    QueueModule,
    HealthModule,
    SubscriberModule,
    ListenerModule,
    MultiOracleModule,
    RescueModule,
    AuditLogModule,
    MetricsModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}