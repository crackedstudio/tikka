import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import {
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhook-delivery.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: WEBHOOK_DELIVERY_QUEUE,
      defaultJobOptions: {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: {
          type: 'custom',
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }),
  ],
  providers: [WebhookDeliveryWorker],
  exports: [BullModule],
})
export class WebhookDeliveryModule {}
