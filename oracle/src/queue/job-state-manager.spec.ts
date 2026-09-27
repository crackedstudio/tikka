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
        {
          provide: OracleLoggerService,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue?: any) => defaultValue),
          },
        },
      ],
    }).compile();

    manager = module.get<JobStateManager>(JobStateManager);
  });

  afterEach(() => {
    manager.reset();
  });

  // ---------------------------------------------------------------------------
  // Job Initialization
  // ---------------------------------------------------------------------------
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

    it('should return undefined for unknown job', () => {
      expect(manager.getJobMetadata('nonexistent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // EXHAUSTIVE STATE TRANSITION TABLE
  // ---------------------------------------------------------------------------
  describe('Exhaustive State Transition Table', () => {
    /**
     * The authoritative transition table as defined in JobStateManager.isValidTransition.
     *
     * Key:
     *   ✅  – allowed
     *   ❌  – rejected (illegal)
     *   🆔  – same-state (always allowed for idempotency)
     *
     * fromState \ toState    Q   G   S   C   +   R   F   DL
     * QUEUED                 🆔  ✅  ❌  ❌  ❌  ❌  ✅  ❌
     * GENERATING             ❌  🆔  ✅  ❌  ❌  ✅  ✅  ❌
     * SUBMITTING             ❌  ❌  🆔  ✅  ❌  ✅  ✅  ❌
     * CONFIRMING             ❌  ❌  ❌  🆔  ✅  ✅  ✅  ❌
     * CONFIRMED              ❌  ❌  ❌  ❌  🆔  ❌  ❌  ❌
     * RETRYING               ❌  ✅  ❌  ❌  ❌  🆔  ❌  ✅
     * FAILED                 ❌  ❌  ❌  ❌  ❌  ❌  🆔  ❌
     * DEAD_LETTERED          ❌  ❌  ❌  ❌  ❌  ❌  ❌  🆔
     */

    const ALL_STATES = Object.values(JobState) as JobState[];

    // Build the expected validity map from the source-of-truth rules.
    // Same-state is always allowed.
    function isExpectedValid(from: JobState, to: JobState): boolean {
      if (from === to) return true;

      const validNext: Record<JobState, JobState[]> = {
        [JobState.QUEUED]: [JobState.GENERATING, JobState.FAILED],
        [JobState.GENERATING]: [JobState.SUBMITTING, JobState.RETRYING, JobState.FAILED],
        [JobState.SUBMITTING]: [JobState.CONFIRMING, JobState.RETRYING, JobState.FAILED],
        [JobState.CONFIRMING]: [JobState.CONFIRMED, JobState.RETRYING, JobState.FAILED],
        [JobState.RETRYING]: [JobState.GENERATING, JobState.DEAD_LETTERED],
        [JobState.CONFIRMED]: [],
        [JobState.FAILED]: [],
        [JobState.DEAD_LETTERED]: [],
      };

      return validNext[from]?.includes(to) ?? false;
    }

    // Helper: bring a job into a given fromState so we can test transitions out of it.
    function setupJobInState(requestId: string, state: JobState): void {
      manager.initializeJob(requestId, 100);

      // Shortest legal path to each state from QUEUED.
      const path: Record<JobState, JobState[]> = {
        [JobState.QUEUED]: [],
        [JobState.GENERATING]: [JobState.GENERATING],
        [JobState.SUBMITTING]: [JobState.GENERATING, JobState.SUBMITTING],
        [JobState.CONFIRMING]: [JobState.GENERATING, JobState.SUBMITTING, JobState.CONFIRMING],
        [JobState.CONFIRMED]: [
          JobState.GENERATING,
          JobState.SUBMITTING,
          JobState.CONFIRMING,
          JobState.CONFIRMED,
        ],
        [JobState.RETRYING]: [JobState.GENERATING, JobState.RETRYING],
        [JobState.FAILED]: [JobState.GENERATING, JobState.FAILED],
        [JobState.DEAD_LETTERED]: [JobState.GENERATING, JobState.RETRYING, JobState.DEAD_LETTERED],
      };

      for (const s of path[state]) {
        const ok = manager.transitionState(requestId, s, 'setup');
        if (!ok) throw new Error(`setupJobInState: transition to ${s} failed for ${requestId}`);
      }
    }

    for (const fromState of ALL_STATES) {
      for (const toState of ALL_STATES) {
        const expected = isExpectedValid(fromState, toState);
        const label = expected ? 'should allow' : 'should reject';
        const testName = `${label} transition ${fromState} → ${toState}`;

        it(testName, () => {
          const id = `exh-${fromState}-${toState}`;

          // Guard: same-state is always allowed; setup must produce the right state first.
          setupJobInState(id, fromState);

          // Verify we are actually in the expected fromState.
          expect(manager.getJobMetadata(id)?.currentState).toBe(fromState);

          const result = manager.transitionState(id, toState, 'exhaustive-test');

          expect(result).toBe(expected);

          // If rejected, the state MUST NOT have changed.
          const after = manager.getJobMetadata(id)?.currentState;
          if (expected) {
            expect(after).toBe(toState);
          } else {
            expect(after).toBe(fromState);
          }
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TERMINAL STATES ARE TERMINAL (supplementary assertions)
  // ---------------------------------------------------------------------------
  describe('Terminal states are truly terminal', () => {
    const TERMINAL_STATES = [
      JobState.CONFIRMED,
      JobState.FAILED,
      JobState.DEAD_LETTERED,
    ] as const;

    const NON_TERMINAL_STATES = [
      JobState.QUEUED,
      JobState.GENERATING,
      JobState.SUBMITTING,
      JobState.CONFIRMING,
      JobState.RETRYING,
    ];

    for (const terminal of TERMINAL_STATES) {
      describe(`from ${terminal}`, () => {
        beforeEach(() => {
          const id = `term-${terminal}`;
          manager.initializeJob(id, 100);

          // Bring the job to the terminal state via the shortest legal path.
          const path: Record<string, JobState[]> = {
            [JobState.CONFIRMED]: [
              JobState.GENERATING,
              JobState.SUBMITTING,
              JobState.CONFIRMING,
              JobState.CONFIRMED,
            ],
            [JobState.FAILED]: [JobState.GENERATING, JobState.FAILED],
            [JobState.DEAD_LETTERED]: [JobState.GENERATING, JobState.RETRYING, JobState.DEAD_LETTERED],
          };

          for (const s of path[terminal]) {
            manager.transitionState(id, s, 'setup');
          }
        });

        it('rejects every non-terminal transition', () => {
          const id = `term-${terminal}`;
          for (const target of NON_TERMINAL_STATES) {
            const result = manager.transitionState(id, target, 'should-be-rejected');
            expect(result).toBe(false);
          }
        });

        it('rejects transitions to other terminal states', () => {
          const id = `term-${terminal}`;
          for (const other of TERMINAL_STATES) {
            if (other !== terminal) {
              const result = manager.transitionState(id, other, 'should-be-rejected');
              expect(result).toBe(false);
            }
          }
        });

        it('still accepts same-state (idempotent) transition', () => {
          const id = `term-${terminal}`;
          const result = manager.transitionState(id, terminal, 'idempotent');
          expect(result).toBe(true);
          const meta = manager.getJobMetadata(id);
          expect(meta?.currentState).toBe(terminal);
        });
      });
    }
  });

  // ---------------------------------------------------------------------------
  // CRASH RECOVERY – no double-submit on restart
  // ---------------------------------------------------------------------------
  describe('Crash recovery – no double-submit on restart', () => {
    /**
     * If the service crashes mid-processing and restarts, the state machine must
     * guarantee that a job already past a certain point cannot regress to a state
     * that would re-execute a side-effect (e.g. re-submitting an on-chain
     * transaction).
     *
     * The critical "point of no return" is the SUBMITTING state: once a job
     * reaches SUBMITTING, the transaction has been broadcast.  Recovery must
     * never allow SUBMITTING → GENERATING (which would regenerate randomness
     * and re-submit).
     */

    it('SUBMITTING cannot go back to GENERATING (prevents double-submit)', () => {
      manager.initializeJob('crash-1', 100);
      manager.transitionState('crash-1', JobState.GENERATING, 'generated');
      manager.transitionState('crash-1', JobState.SUBMITTING, 'submitted');

      // On restart the worker might try to resume — ensure it cannot regress.
      const result = manager.transitionState('crash-1', JobState.GENERATING, 'restart-resume');
      expect(result).toBe(false);

      // … and the state stays at SUBMITTING.
      expect(manager.getJobMetadata('crash-1')?.currentState).toBe(JobState.SUBMITTING);
    });

    it('CONFIRMING cannot go back to SUBMITTING (prevents duplicate confirmation)', () => {
      manager.initializeJob('crash-2', 100);
      manager.transitionState('crash-2', JobState.GENERATING, 'generated');
      manager.transitionState('crash-2', JobState.SUBMITTING, 'submitted');
      manager.transitionState('crash-2', JobState.CONFIRMING, 'confirming');

      const result = manager.transitionState('crash-2', JobState.SUBMITTING, 'restart-resume');
      expect(result).toBe(false);

      expect(manager.getJobMetadata('crash-2')?.currentState).toBe(JobState.CONFIRMING);
    });

    it('QUEUED job that was never processed can still enter GENERATING (no double-submit risk)', () => {
      manager.initializeJob('crash-3', 100);
      // Simulate a crash before any processing started.
      const result = manager.transitionState('crash-3', JobState.GENERATING, 'restart-process');
      expect(result).toBe(true);
    });

    it('GENERATING job that crashed can still enter GENERATING (idempotent restart)', () => {
      manager.initializeJob('crash-4', 100);
      manager.transitionState('crash-4', JobState.GENERATING, 'initial');
      // Crashed before finishing generation — restart re-transitions to GENERATING.
      const result = manager.transitionState('crash-4', JobState.GENERATING, 'idempotent-restart');
      expect(result).toBe(true);
      expect(manager.getJobMetadata('crash-4')?.currentState).toBe(JobState.GENERATING);
    });

    it('RETRYING job can only go forward to GENERATING or DEAD_LETTERED', () => {
      manager.initializeJob('crash-5', 100);
      manager.transitionState('crash-5', JobState.GENERATING);
      manager.transitionState('crash-5', JobState.RETRYING, 'failed once');

      // Should NOT be able to bounce back to QUEUED (would re-queue).
      expect(manager.transitionState('crash-5', JobState.QUEUED)).toBe(false);
      // Should NOT be able to skip to SUBMITTING (would submit without generation).
      expect(manager.transitionState('crash-5', JobState.SUBMITTING)).toBe(false);

      // Allowed: retry (go back to GENERATING)
      expect(manager.transitionState('crash-5', JobState.GENERATING, 'retry')).toBe(true);
    });

    it('a job in any non-terminal state stays in that state after a rejected illegal transition', () => {
      const id = 'crash-stable';
      manager.initializeJob(id, 100);
      const stableStates = [
        JobState.QUEUED,
        JobState.GENERATING,
        JobState.SUBMITTING,
        JobState.CONFIRMING,
        JobState.RETRYING,
      ];

      for (const state of stableStates) {
        manager.reset();
        manager.initializeJob(id, 100);
        // Path to state
        const paths: Record<string, JobState[]> = {
          [JobState.QUEUED]: [],
          [JobState.GENERATING]: [JobState.GENERATING],
          [JobState.SUBMITTING]: [JobState.GENERATING, JobState.SUBMITTING],
          [JobState.CONFIRMING]: [JobState.GENERATING, JobState.SUBMITTING, JobState.CONFIRMING],
          [JobState.RETRYING]: [JobState.GENERATING, JobState.RETRYING],
        };
        for (const s of paths[state]) {
          manager.transitionState(id, s, 'setup');
        }

        // Attempt obviously illegal transitions from every non-terminal state.
        expect(manager.transitionState(id, JobState.CONFIRMED)).toBe(false);
        expect(manager.transitionState(id, JobState.DEAD_LETTERED)).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // PRIORITY CLASSIFIER INTERACTION
  // ---------------------------------------------------------------------------
  describe('Priority classification does not bypass state machine', () => {
    /**
     * The PriorityClassifierService assigns HIGH / MEDIUM / LOW tiers but it
     * must *never* influence which state transitions are allowed.  A high-
     * priority job follows the same exact state machine as a low-priority one.
     *
     * Since the state machine is entirely priority-agnostic, we verify that
     * transitions that are illegal for one priority are illegal for all.
     */

    // Simulate different priority tiers via the 'reason' field; the manager
    // should treat every job identically regardless.
    const PRIORITY_TIERS = ['HIGH', 'MEDIUM', 'LOW'] as const;

    for (const tier of PRIORITY_TIERS) {
      describe(`a ${tier}-priority job`, () => {
        const id = `prio-${tier}`;

        beforeEach(() => {
          manager.initializeJob(id, 100);
        });

        it('cannot skip states to jump directly to CONFIRMED', () => {
          const result = manager.transitionState(id, JobState.CONFIRMED, `${tier}-priority`);
          expect(result).toBe(false);
          // Must remain in QUEUED.
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.QUEUED);
        });

        it('cannot skip states to jump directly to DEAD_LETTERED', () => {
          const result = manager.transitionState(id, JobState.DEAD_LETTERED, `${tier}-priority`);
          expect(result).toBe(false);
        });

        it('must follow the standard happy path step by step', () => {
          manager.transitionState(id, JobState.GENERATING);
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.GENERATING);

          manager.transitionState(id, JobState.SUBMITTING);
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.SUBMITTING);

          manager.transitionState(id, JobState.CONFIRMING);
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.CONFIRMING);

          manager.transitionState(id, JobState.CONFIRMED);
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.CONFIRMED);
        });

        it('can still fail from QUEUED', () => {
          const result = manager.transitionState(id, JobState.FAILED, `${tier}-priority validation error`);
          expect(result).toBe(true);
          expect(manager.getJobMetadata(id)?.currentState).toBe(JobState.FAILED);
        });

        it('cannot go from QUEUED to SUBMITTING directly', () => {
          const result = manager.transitionState(id, JobState.SUBMITTING, `${tier}-priority`);
          expect(result).toBe(false);
        });

        it('cannot go from QUEUED to CONFIRMING directly', () => {
          const result = manager.transitionState(id, JobState.CONFIRMING, `${tier}-priority`);
          expect(result).toBe(false);
        });

        it('cannot go from QUEUED to RETRYING directly', () => {
          const result = manager.transitionState(id, JobState.RETRYING, `${tier}-priority`);
          expect(result).toBe(false);
        });
      });
    }

    it('priority value stored in reason does not alter transition logic', () => {
      manager.initializeJob('prio-reason', 100);

      // No transition is accepted based on reason text.
      const result = manager.transitionState('prio-reason', JobState.SUBMITTING, 'priority=1');
      expect(result).toBe(false);

      // Legal transitions work with any reason.
      expect(
        manager.transitionState('prio-reason', JobState.GENERATING, 'priority=1'),
      ).toBe(true);
      expect(
        manager.transitionState('prio-reason', JobState.SUBMITTING, 'priority=10'),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // State Transition (existing happy-path)
  // ---------------------------------------------------------------------------
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

    it('should allow transition from QUEUED to GENERATING', () => {
      const result = manager.transitionState('req-1', JobState.GENERATING);
      expect(result).toBe(true);
      expect(manager.getJobMetadata('req-1')?.currentState).toBe(JobState.GENERATING);
    });

    it('should allow transition from GENERATING to SUBMITTING', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      const result = manager.transitionState('req-1', JobState.SUBMITTING);
      expect(result).toBe(true);
      expect(manager.getJobMetadata('req-1')?.currentState).toBe(JobState.SUBMITTING);
    });

    it('should allow transition from GENERATING to RETRYING', () => {
      manager.transitionState('req-1', JobState.GENERATING);
      const result = manager.transitionState('req-1', JobState.RETRYING, 'Generation failed');
      expect(result).toBe(true);
      expect(manager.getJobMetadata('req-1')?.currentState).toBe(JobState.RETRYING);
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

    it('should reject transition for unknown job', () => {
      const result = manager.transitionState('unknown-req', JobState.GENERATING);
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Attempt Tracking
  // ---------------------------------------------------------------------------
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

    it('should return false for unknown job', () => {
      const result = manager.incrementAttempt('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrency Management
  // ---------------------------------------------------------------------------
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

    it('should decrement count when going from GENERATING to RETRYING', () => {
      manager.initializeJob('req-1', 100);
      manager.transitionState('req-1', JobState.GENERATING);
      expect(manager.getActiveProcessingCount()).toBe(1);

      manager.transitionState('req-1', JobState.RETRYING);
      expect(manager.getActiveProcessingCount()).toBe(0);
    });

    it('should not double-count same-state transitions', () => {
      manager.initializeJob('req-1', 100);
      manager.transitionState('req-1', JobState.GENERATING);
      expect(manager.getActiveProcessingCount()).toBe(1);

      // Same-state idempotent transition should not increment again.
      manager.transitionState('req-1', JobState.GENERATING);
      expect(manager.getActiveProcessingCount()).toBe(1);
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

  // ---------------------------------------------------------------------------
  // Backoff Calculation
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Metrics and Telemetry
  // ---------------------------------------------------------------------------
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

    it('should return empty array for state with no jobs', () => {
      manager.reset();
      const jobs = manager.getJobsByState(JobState.GENERATING);
      expect(jobs).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Transaction Result Recording
  // ---------------------------------------------------------------------------
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

    it('should not throw for unknown job', () => {
      expect(() => {
        manager.recordTransactionResult('unknown', 'tx-hash', 0);
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
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

    it('should clean up dead-lettered jobs when old', () => {
      manager.initializeJob('req-old-dead', 108);
      manager.transitionState('req-old-dead', JobState.GENERATING);
      manager.transitionState('req-old-dead', JobState.RETRYING);
      manager.transitionState('req-old-dead', JobState.DEAD_LETTERED);

      const deadJob = manager.getJobMetadata('req-old-dead');
      if (deadJob) deadJob.updatedAt = Date.now() - 7200000;

      const cleaned = manager.cleanupOldJobs(3600000);
      expect(cleaned).toBe(1);
    });
  });
});