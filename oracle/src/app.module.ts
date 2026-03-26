import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { ListenerModule } from './listener/listener.module';
import { KeysModule } from './keys/keys.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KeysModule,
    QueueModule,
    HealthModule,
    ListenerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
