import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationService } from '../../../services/notification.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { NotificationRetryModule } from '../../../services/notification-retry.module';

@Module({
  imports: [NotificationRetryModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationService, PushNotificationService],
  exports: [NotificationsService, NotificationService, PushNotificationService],
})
export class NotificationsModule {}
