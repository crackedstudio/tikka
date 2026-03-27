import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { SubscriberModule } from './subscriber/subscriber.module';
import { ListenerModule } from './listener/listener.module';
import { KeysModule } from './keys/keys.module';
import { AuditModule } from './audit/audit.module';
import { batchConfig } from './config/batch.config';
import { VerifyModule } from './verify/verify.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [batchConfig] }),
    KeysModule,
    QueueModule,
    HealthModule,
    SubscriberModule,
    ListenerModule,
    AuditModule,
    VerifyModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}