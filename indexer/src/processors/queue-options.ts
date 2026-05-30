import type { JobsOptions } from 'bullmq';

/**
 * Centralized BullMQ job options.
 *
 * These defaults are intentionally conservative to protect Redis + Postgres under load.
 *
 * Retry policy:
 * - attempts: how many times BullMQ will run the job including the first attempt.
 * - backoff: exponential backoff with a bounded delay.
 *
 * Cleanup policy:
 * - removeOnComplete keeps queue sizes bounded.
 * - removeOnFail keeps recent failures visible for debugging but prevents unbounded growth.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000, // base delay (ms)
  },
  removeOnComplete: 10,
  removeOnFail: 50,
};

/**
 * Example presets you can use for jobs we expect to be retryable.
 */
export const RETRYABLE_JOB_OPTIONS: JobsOptions = {
  ...DEFAULT_JOB_OPTIONS,
};

/**
 * Example preset for jobs that are idempotent but likely non-retryable (e.g. validation failures).
 *
 * Keep attempts = 1 to ensure poison messages surface quickly.
 */
export const NON_RETRYABLE_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete,
  removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail,
};

