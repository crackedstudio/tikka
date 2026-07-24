import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JobState,
  JobMetadata,
  JobStateTransition,
  QueueConfig,
  QueueMetrics,
  DEFAULT_QUEUE_CONFIG,
} from './job-state.types';

/**
 * Centralized job state manager for tracking randomness request lifecycles.
 * Implements explicit state machine with transition validation and telemetry.
 */
@Injectable()
export class JobStateManager {
  
  private readonly jobMetadata = new Map<string, JobMetadata>();
  private readonly config: QueueConfig;
  private activeProcessingCount = 0;

  constructor(private readonly logger: OracleLoggerService, private readonly configService: ConfigService) {
    this.config = {
      maxRetries: this.configService.get<number>('QUEUE_MAX_RETRIES', DEFAULT_QUEUE_CONFIG.maxRetries),
      initialBackoffMs: this.configService.get<number>('QUEUE_INITIAL_BACKOFF_MS', DEFAULT_QUEUE_CONFIG.initialBackoffMs),
      backoffMultiplier: this.configService.get<number>('QUEUE_BACKOFF_MULTIPLIER', DEFAULT_QUEUE_CONFIG.backoffMultiplier),
      maxBackoffMs: this.configService.get<number>('QUEUE_MAX_BACKOFF_MS', DEFAULT_QUEUE_CONFIG.maxBackoffMs),
      confirmationTimeoutMs: this.configService.get<number>('QUEUE_CONFIRMATION_TIMEOUT_MS', DEFAULT_QUEUE_CONFIG.confirmationTimeoutMs),
      maxConcurrency: this.configService.get<number>('QUEUE_MAX_CONCURRENCY', DEFAULT_QUEUE_CONFIG.maxConcurrency),
      generationTimeoutMs: this.configService.get<number>('QUEUE_GENERATION_TIMEOUT_MS', DEFAULT_QUEUE_CONFIG.generationTimeoutMs),
      submissionTimeoutMs: this.configService.get<number>('QUEUE_SUBMISSION_TIMEOUT_MS', DEFAULT_QUEUE_CONFIG.submissionTimeoutMs),
    };

    this.logger.log(`JobStateManager initialized with config: ${JSON.stringify(this.config)}`);
  }

  /**
   * Initialize a new job in the queued state.
   */
  initializeJob(requestId: string, raffleId: number): JobMetadata {
    const now = Date.now();
    const metadata: JobMetadata = {
      requestId,
      raffleId,
      currentState: JobState.QUEUED,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      transitions: [
        {
          fromState: JobState.QUEUED,
          toState: JobState.QUEUED,
          timestamp: now,
          reason: 'Job initialized',
        },
      ],
    };

    this.jobMetadata.set(requestId, metadata);
    this.logger.log(`Job ${requestId} (raffle ${raffleId}) initialized in QUEUED state`);
    return metadata;
  }

  /**
   * Transition a job to a new state with validation.
   */
  transitionState(
    requestId: string,
    toState: JobState,
    reason?: string,
    error?: string,
  ): boolean {
    const metadata = this.jobMetadata.get(requestId);
    if (!metadata) {
      this.logger.error(`Cannot transition unknown job ${requestId} to ${toState}`);
      return false;
    }

    const fromState = metadata.currentState;

    // Validate state transition
    if (!this.isValidTransition(fromState, toState)) {
      this.logger.error(
        `Invalid state transition for job ${requestId}: ${fromState} → ${toState}`,
      );
      return false;
    }

    // Update metadata
    const now = Date.now();
    const transition: JobStateTransition = {
      fromState,
      toState,
      timestamp: now,
      reason,
      attemptNumber: metadata.attemptCount,
    };

    metadata.currentState = toState;
    metadata.updatedAt = now;
    metadata.transitions.push(transition);

    if (error) {
      metadata.lastError = error;
    }

    // Track concurrency for processing states
    if (this.isProcessingState(toState) && !this.isProcessingState(fromState)) {
      this.activeProcessingCount++;
    } else if (!this.isProcessingState(toState) && this.isProcessingState(fromState)) {
      this.activeProcessingCount = Math.max(0, this.activeProcessingCount - 1);
    }

    this.logger.log(
      `Job ${requestId} transitioned: ${fromState} → ${toState}` +
      (reason ? ` (${reason})` : '') +
      ` [attempt ${metadata.attemptCount}/${this.config.maxRetries}]`,
    );

    return true;
  }

  /**
   * Increment attempt count and check if job should be dead-lettered.
   */
  incrementAttempt(requestId: string): boolean {
    const metadata = this.jobMetadata.get(requestId);
    if (!metadata) {
      return false;
    }

    metadata.attemptCount++;
    metadata.updatedAt = Date.now();

    const shouldDeadLetter = metadata.attemptCount >= this.config.maxRetries;
    
    if (shouldDeadLetter) {
      this.logger.warn(
        `Job ${requestId} exhausted ${this.config.maxRetries} attempts, marking for dead-letter`,
      );
    }

    return shouldDeadLetter;
  }

  /**
   * Check if a job can acquire a processing slot based on concurrency limits.
   */
  canAcquireProcessingSlot(): boolean {
    return this.activeProcessingCount < this.config.maxConcurrency;
  }

  /**
   * Calculate exponential backoff delay for retry.
   */
  calculateBackoff(attemptCount: number): number {
    if (attemptCount <= 0) {
      return 0;
    }

    const exponentialDelay =
      this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attemptCount - 1);
    
    return Math.min(exponentialDelay, this.config.maxBackoffMs);
  }

  /**
   * Record transaction hash and ledger for a job.
   */
  recordTransactionResult(requestId: string, txHash: string, ledger: number): void {
    const metadata = this.jobMetadata.get(requestId);
    if (metadata) {
      metadata.txHash = txHash;
      metadata.ledger = ledger;
      metadata.updatedAt = Date.now();
    }
  }

  /**
   * Get job metadata by request ID.
   */
  getJobMetadata(requestId: string): JobMetadata | undefined {
    return this.jobMetadata.get(requestId);
  }

  /**
   * Get all jobs in a specific state.
   */
  getJobsByState(state: JobState): JobMetadata[] {
    return Array.from(this.jobMetadata.values()).filter(
      (metadata) => metadata.currentState === state,
    );
  }

  /**
   * Get queue configuration.
   */
  getConfig(): QueueConfig {
    return { ...this.config };
  }

  /**
   * Get comprehensive queue metrics for operator visibility.
   */
  getMetrics(): QueueMetrics {
    const jobs = Array.from(this.jobMetadata.values());

    const queuedCount = jobs.filter((j) => j.currentState === JobState.QUEUED).length;
    const generatingCount = jobs.filter((j) => j.currentState === JobState.GENERATING).length;
    const submittingCount = jobs.filter((j) => j.currentState === JobState.SUBMITTING).length;
    const confirmingCount = jobs.filter((j) => j.currentState === JobState.CONFIRMING).length;
    const retryingCount = jobs.filter((j) => j.currentState === JobState.RETRYING).length;
    const confirmedCount = jobs.filter((j) => j.currentState === JobState.CONFIRMED).length;
    const failedCount = jobs.filter((j) => j.currentState === JobState.FAILED).length;
    const deadLetteredCount = jobs.filter((j) => j.currentState === JobState.DEAD_LETTERED).length;

    const pendingCount = queuedCount + generatingCount + submittingCount + confirmingCount + retryingCount;
    const totalFailedCount = failedCount + deadLetteredCount;

    return {
      queuedCount,
      generatingCount,
      submittingCount,
      confirmingCount,
      retryingCount,
      confirmedCount,
      failedCount,
      deadLetteredCount,
      pendingCount,
      totalFailedCount,
    };
  }

  /**
   * Clean up completed or terminal jobs older than retention period.
   */
  cleanupOldJobs(retentionMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, metadata] of this.jobMetadata.entries()) {
      const isTerminal =
        metadata.currentState === JobState.CONFIRMED ||
        metadata.currentState === JobState.FAILED ||
        metadata.currentState === JobState.DEAD_LETTERED;

      const age = now - metadata.updatedAt;

      if (isTerminal && age > retentionMs) {
        this.jobMetadata.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old terminal jobs`);
    }

    return cleaned;
  }

  /**
   * Validate if a state transition is allowed.
   */
  private isValidTransition(fromState: JobState, toState: JobState): boolean {
    // Allow same-state transitions for idempotency
    if (fromState === toState) {
      return true;
    }

    const validTransitions: Record<JobState, JobState[]> = {
      [JobState.QUEUED]: [JobState.GENERATING, JobState.FAILED],
      [JobState.GENERATING]: [JobState.SUBMITTING, JobState.RETRYING, JobState.FAILED],
      [JobState.SUBMITTING]: [JobState.CONFIRMING, JobState.RETRYING, JobState.FAILED],
      [JobState.CONFIRMING]: [JobState.CONFIRMED, JobState.RETRYING, JobState.FAILED],
      [JobState.RETRYING]: [JobState.GENERATING, JobState.DEAD_LETTERED],
      [JobState.CONFIRMED]: [], // Terminal state
      [JobState.FAILED]: [], // Terminal state
      [JobState.DEAD_LETTERED]: [], // Terminal state
    };

    return validTransitions[fromState]?.includes(toState) ?? false;
  }

  /**
   * Check if a state is a processing state (counts toward concurrency).
   */
  private isProcessingState(state: JobState): boolean {
    return (
      state === JobState.GENERATING ||
      state === JobState.SUBMITTING ||
      state === JobState.CONFIRMING
    );
  }

  /**
   * Get active processing count for monitoring.
   */
  getActiveProcessingCount(): number {
    return this.activeProcessingCount;
  }

  /**
   * Reset all state (for testing purposes).
   */
  reset(): void {
    this.jobMetadata.clear();
    this.activeProcessingCount = 0;
    this.logger.log('JobStateManager reset');
  }
}
