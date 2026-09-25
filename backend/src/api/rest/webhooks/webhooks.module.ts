import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhookService } from '../../../services/webhooks/webhook.service';
import { WebhookDeliveryModule } from '../../../queues/webhook-delivery.module';

@Module({
  imports: [WebhookDeliveryModule],
  controllers: [WebhooksController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhooksModule {}
