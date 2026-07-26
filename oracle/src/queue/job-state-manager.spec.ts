import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JobStateManager } from './job-state-manager';
import { JobState, DEFAULT_QUEUE_CONFIG } from './job-state.types';
import { OracleLoggerService } from '../logger/oracle-logger';

describe('JobStateManager', () => {
  let manager: JobStateManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobStateManager,
        { provide: OracleLoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => defaultValue),
          },
        },
      ],
    }).compile();

    manager = module.get<JobStateManager>(JobStateManager);
  });

  afterEach(() => {
    manager.reset();
  });

  describe('Job Initialization', () => {
    it('should initialize a job in QUEUED state', () => {
      const metadata = manager.initializeJob('req-1', 100);

      expect(metadata.requestId).toBe('req-1');
      expect(metadata.raffleId).toBe(100);
      expect(metadata.currentState).toBe(JobState.QUEUED);
      expect(metadata.attemptCount).toBe(0);
      expect(metadata.transitions).toHaveLength(1);
      expect(metadata.transitions[0].toState).toBe(JobState.QUEUED);
    });

    it('should track multiple jobs independently', () => {
      manager.initializeJob('req-1', 100);
      manager.initializeJob('req-2', 200);

      const job1 = manager.getJobMetadata('req-1');
      const job2 = manager.getJobMetadata('req-2');

      expect(job1?.raffleId).toBe(100);
      expect(job2?.raffleId).toBe(200);
    });
  });

  describe('State Transitions', () => {
    beforeEach(() => {
      manager.initializeJob('req-1', 100);
    });

    it('should transition from QUEUED to GENERATING', () => {
      const success = manager.transitionState('req-1', JobState.GENERATING, 'Starting generation');

      expect(success).toBe(true);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.GENERATING);
      expect(metadata?.transitions).toHaveLength(2);
    });

    it('should transition through complete success flow', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.SUBMITTING);
      manager.transitionState('req-1', JobState.CONFIRMING);
      manager.transitionState('req-1', JobState.CONFIRMED);

      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.CONFIRMED);
      expect(metadata?.transitions).toHaveLength(5); // Initial + 4 transitions
    });

    it('should reject invalid state transitions', () => {
      const success = manager.transitionState('req-1', JobState.CONFIRMED);

      expect(success).toBe(false);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.QUEUED);
    });

    it('should allow transition to RETRYING from GENERATING', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      const success = manager.transitionState('req-1', JobState.RETRYING, 'Generation failed');

      expect(success).toBe(true);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.RETRYING);
    });

    it('should allow transition from RETRYING back to GENERATING', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.RETRYING);
      const success = manager.transitionState('req-1', JobState.GENERATING, 'Retry attempt');

      expect(success).toBe(true);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.GENERATING);
    });

    it('should not allow transitions from terminal CONFIRMED state', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.SUBMITTING);
      manager.transitionState('req-1', JobState.CONFIRMING);
      manager.transitionState('req-1', JobState.CONFIRMED);

      const success = manager.transitionState('req-1', JobState.GENERATING);

      expect(success).toBe(false);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.CONFIRMED);
    });

    it('should not allow transitions from terminal FAILED state', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.FAILED, 'Non-retriable error');

      const success = manager.transitionState('req-1', JobState.RETRYING);

      expect(success).toBe(false);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.FAILED);
    });

    it('should not allow transitions from terminal DEAD_LETTERED state', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.RETRYING);
      manager.transitionState('req-1', JobState.DEAD_LETTERED, 'Max retries exhausted');

      const success = manager.transitionState('req-1', JobState.GENERATING);

      expect(success).toBe(false);
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.currentState).toBe(JobState.DEAD_LETTERED);
    });

    it('should record error messages in transitions', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.FAILED, 'Test error', 'Detailed error message');

      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.lastError).toBe('Detailed error message');
    });
  });

  describe('Attempt Tracking', () => {
    beforeEach(() => {
      manager.initializeJob('req-1', 100);
    });

    it('should increment attempt count', () => {
      manager.incrementAttempt('req-1');
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.attemptCount).toBe(1);
    });

    it('should return false when below max retries', () => {
      const shouldDeadLetter = manager.incrementAttempt('req-1');
      expect(shouldDeadLetter).toBe(false);
    });

    it('should return true when reaching max retries', () => {
      // Default max retries is 5
      for (let i = 0; i < 4; i++) {
        const result = manager.incrementAttempt('req-1');
        expect(result).toBe(false);
      }

      const shouldDeadLetter = manager.incrementAttempt('req-1');
      expect(shouldDeadLetter).toBe(true);
      
      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.attemptCount).toBe(5);
    });
  });

  describe('Concurrency Management', () => {
    it('should allow processing when under concurrency limit', () => {
      expect(manager.canAcquireProcessingSlot()).toBe(true);
    });

    it('should track active processing count', () => {
      manager.initializeJob('req-1', 100);
      manager.transitionState('req-1', JobState.GENERATING);

      expect(manager.getActiveProcessingCount()).toBe(1);
    });

    it('should decrement count when leaving processing state', () => {
      manager.initializeJob('req-1', 100);
      manager.transitionState('req-1', JobState.GENERATING);
      manager.transitionState('req-1', JobState.SUBMITTING);
      manager.transitionState('req-1', JobState.CONFIRMING);
      manager.transitionState('req-1', JobState.CONFIRMED);

      expect(manager.getActiveProcessingCount()).toBe(0);
    });

    it('should enforce concurrency limit', () => {
      const config = manager.getConfig();
      
      // Fill up to max concurrency
      for (let i = 0; i < config.maxConcurrency; i++) {
        manager.initializeJob(`req-${i}`, 100 + i);
        manager.transitionState(`req-${i}`, JobState.GENERATING);
      }

      expect(manager.canAcquireProcessingSlot()).toBe(false);
    });

    it('should allow new processing after job completes', () => {
      const config = manager.getConfig();
      
      // Fill up to max concurrency
      for (let i = 0; i < config.maxConcurrency; i++) {
        manager.initializeJob(`req-${i}`, 100 + i);
        manager.transitionState(`req-${i}`, JobState.GENERATING);
      }

      // Complete one job
      manager.transitionState('req-0', JobState.SUBMITTING);
      manager.transitionState('req-0', JobState.CONFIRMING);
      manager.transitionState('req-0', JobState.CONFIRMED);

      expect(manager.canAcquireProcessingSlot()).toBe(true);
    });
  });

  describe('Backoff Calculation', () => {
    it('should return 0 for attempt 0', () => {
      const backoff = manager.calculateBackoff(0);
      expect(backoff).toBe(0);
    });

    it('should calculate exponential backoff', () => {
      // Default: initialBackoffMs=2000, multiplier=2
      expect(manager.calculateBackoff(1)).toBe(2000);
      expect(manager.calculateBackoff(2)).toBe(4000);
      expect(manager.calculateBackoff(3)).toBe(8000);
      expect(manager.calculateBackoff(4)).toBe(16000);
    });

    it('should cap backoff at maxBackoffMs', () => {
      // Default maxBackoffMs=60000
      const backoff = manager.calculateBackoff(10);
      expect(backoff).toBe(60000);
    });
  });

  describe('Metrics and Telemetry', () => {
    beforeEach(() => {
      // Create jobs in various states
      manager.initializeJob('req-queued', 100);
      
      manager.initializeJob('req-generating', 101);
      manager.transitionState('req-generating', JobState.GENERATING);
      
      manager.initializeJob('req-submitting', 102);
      manager.transitionState('req-submitting', JobState.GENERATING);
      manager.transitionState('req-submitting', JobState.SUBMITTING);
      
      manager.initializeJob('req-confirming', 103);
      manager.transitionState('req-confirming', JobState.GENERATING);
      manager.transitionState('req-confirming', JobState.SUBMITTING);
      manager.transitionState('req-confirming', JobState.CONFIRMING);
      
      manager.initializeJob('req-retrying', 104);
      manager.transitionState('req-retrying', JobState.GENERATING);
      manager.transitionState('req-retrying', JobState.RETRYING);
      
      manager.initializeJob('req-confirmed', 105);
      manager.transitionState('req-confirmed', JobState.GENERATING);
      manager.transitionState('req-confirmed', JobState.SUBMITTING);
      manager.transitionState('req-confirmed', JobState.CONFIRMING);
      manager.transitionState('req-confirmed', JobState.CONFIRMED);
      
      manager.initializeJob('req-failed', 106);
      manager.transitionState('req-failed', JobState.GENERATING);
      manager.transitionState('req-failed', JobState.FAILED);
      
      manager.initializeJob('req-dead', 107);
      manager.transitionState('req-dead', JobState.GENERATING);
      manager.transitionState('req-dead', JobState.RETRYING);
      manager.transitionState('req-dead', JobState.DEAD_LETTERED);
    });

    it('should return accurate metrics for all states', () => {
      const metrics = manager.getMetrics();

      expect(metrics.queuedCount).toBe(1);
      expect(metrics.generatingCount).toBe(1);
      expect(metrics.submittingCount).toBe(1);
      expect(metrics.confirmingCount).toBe(1);
      expect(metrics.retryingCount).toBe(1);
      expect(metrics.confirmedCount).toBe(1);
      expect(metrics.failedCount).toBe(1);
      expect(metrics.deadLetteredCount).toBe(1);
    });

    it('should calculate pending count correctly', () => {
      const metrics = manager.getMetrics();
      // queued + generating + submitting + confirming + retrying
      expect(metrics.pendingCount).toBe(5);
    });

    it('should calculate total failed count correctly', () => {
      const metrics = manager.getMetrics();
      // failed + dead-lettered
      expect(metrics.totalFailedCount).toBe(2);
    });

    it('should get jobs by state', () => {
      const retryingJobs = manager.getJobsByState(JobState.RETRYING);
      expect(retryingJobs).toHaveLength(1);
      expect(retryingJobs[0].requestId).toBe('req-retrying');

      const deadLetteredJobs = manager.getJobsByState(JobState.DEAD_LETTERED);
      expect(deadLetteredJobs).toHaveLength(1);
      expect(deadLetteredJobs[0].requestId).toBe('req-dead');
    });
  });

  describe('Transaction Result Recording', () => {
    beforeEach(() => {
      manager.initializeJob('req-1', 100);
    });

    it('should record transaction hash and ledger', () => {
      manager.recordTransactionResult('req-1', 'tx-hash-123', 12345);

      const metadata = manager.getJobMetadata('req-1');
      expect(metadata?.txHash).toBe('tx-hash-123');
      expect(metadata?.ledger).toBe(12345);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      manager.initializeJob('req-old-confirmed', 100);
      manager.transitionState('req-old-confirmed', JobState.GENERATING);
      manager.transitionState('req-old-confirmed', JobState.SUBMITTING);
      manager.transitionState('req-old-confirmed', JobState.CONFIRMING);
      manager.transitionState('req-old-confirmed', JobState.CONFIRMED);

      manager.initializeJob('req-old-failed', 101);
      manager.transitionState('req-old-failed', JobState.GENERATING);
      manager.transitionState('req-old-failed', JobState.FAILED);

      manager.initializeJob('req-active', 102);
      manager.transitionState('req-active', JobState.GENERATING);
    });

    it('should clean up old terminal jobs', () => {
      // Manually set old timestamps
      const oldJob1 = manager.getJobMetadata('req-old-confirmed');
      const oldJob2 = manager.getJobMetadata('req-old-failed');
      if (oldJob1) oldJob1.updatedAt = Date.now() - 7200000; // 2 hours ago
      if (oldJob2) oldJob2.updatedAt = Date.now() - 7200000;

      const cleaned = manager.cleanupOldJobs(3600000); // 1 hour retention

      expect(cleaned).toBe(2);
      expect(manager.getJobMetadata('req-old-confirmed')).toBeUndefined();
      expect(manager.getJobMetadata('req-old-failed')).toBeUndefined();
      expect(manager.getJobMetadata('req-active')).toBeDefined();
    });

    it('should not clean up recent terminal jobs', () => {
      const cleaned = manager.cleanupOldJobs(3600000);

      expect(cleaned).toBe(0);
      expect(manager.getJobMetadata('req-old-confirmed')).toBeDefined();
      expect(manager.getJobMetadata('req-old-failed')).toBeDefined();
    });

    it('should not clean up active jobs regardless of age', () => {
      const activeJob = manager.getJobMetadata('req-active');
      if (activeJob) activeJob.updatedAt = Date.now() - 7200000;

      const cleaned = manager.cleanupOldJobs(3600000);

      expect(manager.getJobMetadata('req-active')).toBeDefined();
    });
  });
});
