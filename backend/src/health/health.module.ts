import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsController } from './metrics.controller';
import { MetadataModule } from '../services/metadata.module';
import { NotificationsModule } from '../api/rest/notifications/notifications.module';

@Module({
  imports: [MetadataModule, NotificationsModule],
  controllers: [HealthController, MetricsController],
  providers: [HealthService],
})
export class HealthModule {}
