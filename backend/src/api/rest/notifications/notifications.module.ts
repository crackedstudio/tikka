import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationService } from '../../../services/notification.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationService],
  exports: [NotificationsService, NotificationService],
})
export class NotificationsModule {}
