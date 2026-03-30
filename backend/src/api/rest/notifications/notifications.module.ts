import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationService } from '../../../services/notification.service';
import { PushNotificationService } from '../../../services/push-notification.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationService, PushNotificationService],
  exports: [NotificationsService, NotificationService, PushNotificationService],
})
export class NotificationsModule {}
