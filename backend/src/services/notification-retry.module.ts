import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationRetryProcessor } from './notification-retry.processor';
import { NotificationRetryService } from './notification-retry.service';
import { SupabaseModule } from './supabase.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notification-retry',
    }),
    SupabaseModule,
  ],
  providers: [NotificationRetryProcessor, NotificationRetryService],
  exports: [NotificationRetryService],
})
export class NotificationRetryModule {}
