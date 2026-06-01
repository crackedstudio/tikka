import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as admin from 'firebase-admin';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { NotificationRetryService, RetryJobData } from './notification-retry.service';
import { PushNotificationService } from './push-notification.service';

@Processor('notification-retry')
export class NotificationRetryProcessor {
  private readonly logger = new Logger(NotificationRetryProcessor.name);

  constructor(
    private readonly retryService: NotificationRetryService,
    private readonly pushNotificationService: PushNotificationService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  @Process()
  async handleRetry(job: Job<RetryJobData>) {
    const { userAddress, deviceToken, payload, jobId } = job.data;

    this.logger.log(
      `Processing retry job ${jobId} for user ${userAddress}, token ${deviceToken.substring(0, 10)}...`,
    );

    try {
      // Attempt to send the notification
      const message = {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: this.mapData(payload.data),
      };

      const response = await admin.messaging().send(message);

      // Success
      this.logger.log(`Retry job ${jobId} succeeded, message ID: ${response}`);
      await this.retryService.markRetryJobCompleted(jobId);
      return { success: true, messageId: response };
    } catch (error) {
      const fcmError = error as admin.FirebaseError | undefined;
      const errorCode = fcmError?.code ?? 'messaging/unknown-error';
      const errorMessage = fcmError?.message ?? String(error);

      this.logger.warn(
        `Retry job ${jobId} failed with error ${errorCode}: ${errorMessage}`,
      );

      // Classify the error
      const { classification, nextAction } = this.pushNotificationService.classifyFcmError(errorCode);

      // Handle stale tokens
      if (nextAction === 'remove_token') {
        this.logger.log(`Removing stale token for retry job ${jobId}`);
        await this.supabase
          .from('push_tokens')
          .delete()
          .eq('user_address', userAddress)
          .eq('device_token', deviceToken);

        // Mark the retry job as failed (no point retrying a dead token)
        await this.retryService.updateRetryJobAfterFailure(
          jobId,
          5, // Set to max attempts to prevent further retries
          errorCode,
          errorMessage,
        );
        return { success: false, reason: 'stale_token_removed' };
      }

      // Handle non-retryable errors
      if (nextAction === 'drop') {
        this.logger.log(`Non-retryable error for retry job ${jobId}, marking as failed`);
        await this.retryService.updateRetryJobAfterFailure(
          jobId,
          5, // Set to max attempts to prevent further retries
          errorCode,
          errorMessage,
        );
        return { success: false, reason: 'non_retryable_error' };
      }

      // Handle retryable errors
      if (nextAction === 'retry') {
        const updatedJob = await this.retryService.updateRetryJobAfterFailure(
          jobId,
          job.attemptNumber,
          errorCode,
          errorMessage,
        );

        if (!updatedJob) {
          this.logger.error(`Failed to update retry job ${jobId}`);
          throw error;
        }

        if (updatedJob.status === 'failed') {
          this.logger.warn(`Retry job ${jobId} exhausted all attempts`);
          return { success: false, reason: 'max_attempts_exceeded' };
        }

        // Re-enqueue with the next delay
        const nextDelay = this.retryService.getNextRetryDelay(job.attemptNumber);
        if (nextDelay > 0) {
          this.logger.log(`Re-enqueueing retry job ${jobId} with delay ${nextDelay}ms`);
          throw new Error(`Retryable error, will retry in ${nextDelay}ms`);
        }
      }

      throw error;
    }
  }

  private mapData(data: Record<string, string | number | boolean> | undefined) {
    if (!data) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)]),
    );
  }
}
