import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhookService } from '../../../services/webhook.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhooksModule {}
