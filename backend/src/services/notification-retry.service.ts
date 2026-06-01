import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { PushNotificationPayload } from './push-notification.service';

const RETRY_TABLE = 'notification_retry_jobs';

export interface NotificationRetryJob {
  id: number;
  user_address: string;
  device_token: string;
  payload: PushNotificationPayload;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface RetryJobData {
  userAddress: string;
  deviceToken: string;
  payload: PushNotificationPayload;
  jobId: number;
}

/**
 * Exponential backoff delays (in milliseconds)
 * Attempts: 1s, 5s, 30s, 2min, 10min
 */
const RETRY_DELAYS_MS = [1000, 5000, 30000, 120000, 600000];

@Injectable()
export class NotificationRetryService {
  private readonly logger = new Logger(NotificationRetryService.name);

  constructor(
    @InjectQueue('notification-retry') private readonly retryQueue: Queue<RetryJobData>,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Enqueue a retry job for a failed notification delivery.
   * Creates a database record and schedules a Bull job with exponential backoff.
   */
  async enqueueRetry(
    userAddress: string,
    deviceToken: string,
    payload: PushNotificationPayload,
    errorCode: string,
    errorMessage: string,
  ): Promise<NotificationRetryJob> {
    // Create the retry job record in the database
    const { data, error } = await this.supabase
      .from(RETRY_TABLE)
      .insert({
        user_address: userAddress,
        device_token: deviceToken,
        payload,
        attempt_count: 0,
        max_attempts: 5,
        status: 'pending',
        last_error_code: errorCode,
        last_error_message: errorMessage,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create retry job: ${error.message}`, error);
      throw error;
    }

    const job = data as NotificationRetryJob;

    // Schedule the first retry with exponential backoff
    const delayMs = RETRY_DELAYS_MS[0]; // 1 second for first retry
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

    // Update the job with the next retry time
    await this.supabase
      .from(RETRY_TABLE)
      .update({ next_retry_at: nextRetryAt })
      .eq('id', job.id);

    // Enqueue the Bull job
    await this.retryQueue.add(
      {
        userAddress,
        deviceToken,
        payload,
        jobId: job.id,
      },
      {
        delay: delayMs,
        attempts: 1, // Bull will handle retries via our processor
        backoff: {
          type: 'exponential',
          delay: 2000, // Not used since we manage delays manually
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Enqueued retry for user ${userAddress}, token ${deviceToken.substring(0, 10)}..., first retry in ${delayMs}ms`,
    );

    return job;
  }

  /**
   * Get the next delay for a retry attempt based on attempt count.
   */
  getNextRetryDelay(attemptCount: number): number {
    if (attemptCount >= RETRY_DELAYS_MS.length) {
      return -1; // No more retries
    }
    return RETRY_DELAYS_MS[attemptCount];
  }

  /**
   * Update a retry job after a failed attempt.
   */
  async updateRetryJobAfterFailure(
    jobId: number,
    attemptCount: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<NotificationRetryJob | null> {
    const nextDelay = this.getNextRetryDelay(attemptCount);

    if (nextDelay === -1) {
      // No more retries, mark as failed
      const { data, error } = await this.supabase
        .from(RETRY_TABLE)
        .update({
          status: 'failed',
          attempt_count: attemptCount,
          last_error_code: errorCode,
          last_error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to update retry job ${jobId}: ${error.message}`);
        return null;
      }

      this.logger.warn(`Retry job ${jobId} exhausted all attempts`);
      return data as NotificationRetryJob;
    }

    // Schedule next retry
    const nextRetryAt = new Date(Date.now() + nextDelay).toISOString();

    const { data, error } = await this.supabase
      .from(RETRY_TABLE)
      .update({
        attempt_count: attemptCount,
        next_retry_at: nextRetryAt,
        last_error_code: errorCode,
        last_error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update retry job ${jobId}: ${error.message}`);
      return null;
    }

    return data as NotificationRetryJob;
  }

  /**
   * Mark a retry job as completed.
   */
  async markRetryJobCompleted(jobId: number): Promise<void> {
    const { error } = await this.supabase
      .from(RETRY_TABLE)
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      this.logger.error(`Failed to mark retry job ${jobId} as completed: ${error.message}`);
    }
  }

  /**
   * Get pending retry jobs that are ready to be retried.
   */
  async getPendingRetryJobs(limit = 100): Promise<NotificationRetryJob[]> {
    const { data, error } = await this.supabase
      .from(RETRY_TABLE)
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.error(`Failed to fetch pending retry jobs: ${error.message}`);
      return [];
    }

    return (data as NotificationRetryJob[]) || [];
  }

  /**
   * Get delivery stats for the past N hours.
   */
  async getDeliveryStats(hoursBack = 24): Promise<Record<string, any>> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from(RETRY_TABLE)
      .select('status, created_at')
      .gte('created_at', cutoffTime);

    if (error) {
      this.logger.error(`Failed to fetch delivery stats: ${error.message}`);
      return {
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
        hoursBack,
      };
    }

    const jobs = (data as NotificationRetryJob[]) || [];
    const stats = {
      pending: jobs.filter(j => j.status === 'pending').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      total: jobs.length,
      hoursBack,
    };

    return stats;
  }
}
