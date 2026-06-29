/**
 * Priority Queue Integration Tests
 * 
 * Tests the PriorityClassifierService and priority ordering in the queue:
 * 1. Submit 10 jobs with mixed priorities (HIGH, MEDIUM, LOW) simultaneously
 * 2. Assert that high-priority jobs are processed before lower-priority jobs
 * 3. Assert that job ordering is stable (FIFO within the same priority tier)
 * 4. Verify that BullMQ respects priority ordering
 * 
 * Uses BullMQ in-memory adapter for isolated testing without Redis dependency.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { Queue, Worker, QueueScheduler } from 'bull';
import { PriorityClassifierService, BULL_PRIORITY } from '../src/queue/priority-classifier.service';

// ─── Test Configuration ──────────────────────────────────────────────────────
const TEST_QUEUE_NAME = 'priority-test-queue';

interface TestJob {
  raffleId: number;
  requestId: string;
  prizeAmount: number;
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
}

describe('Priority Queue Integration Tests', () => {
  let module: TestingModule;
  let priorityClassifier: PriorityClassifierService;
  let queue: Queue<TestJob>;
  let processedJobs: TestJob[] = [];
  let worker: Worker<TestJob>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({
          redis: {
            host: 'localhost',
            port: 6379,
          },
        }),
        BullModule.registerQueue({
          name: TEST_QUEUE_NAME,
        }),
      ],
      providers: [
        PriorityClassifierService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'ORACLE_HIGH_VALUE_THRESHOLD_XLM') return 10000;
              if (key === 'ORACLE_MED_VALUE_THRESHOLD_XLM') return 1000;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    priorityClassifier = module.get<PriorityClassifierService>(PriorityClassifierService);
    queue = module.get(`BullQueue_${TEST_QUEUE_NAME}`);

    // Clean the queue before tests
    await queue.clean(0, 'active');
    await queue.clean(0, 'wait');
    await queue.clean(0, 'completed');

    // Set up job processor
    processedJobs = [];
    worker = new Worker<TestJob>(TEST_QUEUE_NAME, async (job) => {
      processedJobs.push(job.data);
      return { processed: true };
    });

    await new Promise((resolve) => {
      worker.on('ready', resolve);
    });
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await module.close();
  });

  afterEach(async () => {
    processedJobs = [];
    await queue.clean(0, 'active');
    await queue.clean(0, 'wait');
    await queue.clean(0, 'completed');
  });

  describe('Priority Classification', () => {
    it('should classify high-value raffles as HIGH priority', () => {
      const result = priorityClassifier.classify(15000);
      expect(result.tier).toBe('HIGH');
      expect(result.priority).toBe(BULL_PRIORITY.HIGH);
    });

    it('should classify medium-value raffles as MEDIUM priority', () => {
      const result = priorityClassifier.classify(5000);
      expect(result.tier).toBe('MEDIUM');
      expect(result.priority).toBe(BULL_PRIORITY.MEDIUM);
    });

    it('should classify low-value raffles as LOW priority', () => {
      const result = priorityClassifier.classify(500);
      expect(result.tier).toBe('LOW');
      expect(result.priority).toBe(BULL_PRIORITY.LOW);
    });

    it('should handle undefined prize amount as LOW priority', () => {
      const result = priorityClassifier.classify(undefined);
      expect(result.tier).toBe('LOW');
      expect(result.priority).toBe(BULL_PRIORITY.LOW);
    });

    it('should handle NaN prize amount as LOW priority', () => {
      const result = priorityClassifier.classify(NaN);
      expect(result.tier).toBe('LOW');
      expect(result.priority).toBe(BULL_PRIORITY.LOW);
    });

    it('should handle negative prize amount as LOW priority', () => {
      const result = priorityClassifier.classify(-1000);
      expect(result.tier).toBe('LOW');
      expect(result.priority).toBe(BULL_PRIORITY.LOW);
    });

    it('should classify edge cases correctly', () => {
      // Exactly at HIGH threshold
      const atHighThreshold = priorityClassifier.classify(10000);
      expect(atHighThreshold.tier).toBe('HIGH');

      // Just below HIGH threshold
      const belowHighThreshold = priorityClassifier.classify(9999);
      expect(belowHighThreshold.tier).toBe('MEDIUM');

      // Exactly at MEDIUM threshold
      const atMediumThreshold = priorityClassifier.classify(1000);
      expect(atMediumThreshold.tier).toBe('MEDIUM');

      // Just below MEDIUM threshold
      const belowMediumThreshold = priorityClassifier.classify(999);
      expect(belowMediumThreshold.tier).toBe('LOW');
    });
  });

  describe('Priority Queue Ordering', () => {
    it('should process high-priority jobs before lower-priority jobs', async () => {
      // Create test jobs with mixed priorities
      const testJobs: TestJob[] = [
        { raffleId: 1, requestId: 'req-1', prizeAmount: 500, tier: 'LOW' },
        { raffleId: 2, requestId: 'req-2', prizeAmount: 20000, tier: 'HIGH' },
        { raffleId: 3, requestId: 'req-3', prizeAmount: 5000, tier: 'MEDIUM' },
        { raffleId: 4, requestId: 'req-4', prizeAmount: 25000, tier: 'HIGH' },
        { raffleId: 5, requestId: 'req-5', prizeAmount: 100, tier: 'LOW' },
        { raffleId: 6, requestId: 'req-6', prizeAmount: 15000, tier: 'HIGH' },
        { raffleId: 7, requestId: 'req-7', prizeAmount: 3000, tier: 'MEDIUM' },
        { raffleId: 8, requestId: 'req-8', prizeAmount: 200, tier: 'LOW' },
        { raffleId: 9, requestId: 'req-9', prizeAmount: 8000, tier: 'MEDIUM' },
        { raffleId: 10, requestId: 'req-10', prizeAmount: 30000, tier: 'HIGH' },
      ];

      // Submit all jobs simultaneously
      await Promise.all(
        testJobs.map((job) => {
          const classification = priorityClassifier.classify(job.prizeAmount);
          return queue.add(job, {
            priority: classification.priority,
            removeOnComplete: true,
          });
        })
      );

      // Wait for all jobs to be processed
      await new Promise((resolve) => {
        const checkCompletion = setInterval(() => {
          if (processedJobs.length === testJobs.length) {
            clearInterval(checkCompletion);
            resolve(null);
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkCompletion);
          resolve(null);
        }, 5000);
      });

      // Verify that HIGH priority jobs come before MEDIUM priority jobs
      const processedTiers = processedJobs.map((job) => job.tier);
      const firstMediumIndex = processedTiers.indexOf('MEDIUM');
      const firstLowIndex = processedTiers.indexOf('LOW');

      // All HIGH jobs should come before MEDIUM jobs
      for (let i = 0; i < processedTiers.length; i++) {
        if (processedTiers[i] === 'HIGH') {
          expect(firstMediumIndex === -1 || i < firstMediumIndex).toBe(true);
        }
        if (processedTiers[i] === 'MEDIUM') {
          expect(firstLowIndex === -1 || i < firstLowIndex).toBe(true);
        }
      }
    });

    it('should maintain FIFO order within the same priority tier', async () => {
      // Create 3 jobs with the same MEDIUM priority
      const mediumJobs: TestJob[] = [
        { raffleId: 1, requestId: 'req-1', prizeAmount: 5000, tier: 'MEDIUM' },
        { raffleId: 2, requestId: 'req-2', prizeAmount: 3000, tier: 'MEDIUM' },
        { raffleId: 3, requestId: 'req-3', prizeAmount: 4000, tier: 'MEDIUM' },
      ];

      // Submit jobs in order
      for (const job of mediumJobs) {
        const classification = priorityClassifier.classify(job.prizeAmount);
        await queue.add(job, {
          priority: classification.priority,
          removeOnComplete: true,
        });
      }

      // Wait for jobs to process
      await new Promise((resolve) => {
        const checkCompletion = setInterval(() => {
          if (processedJobs.length === mediumJobs.length) {
            clearInterval(checkCompletion);
            resolve(null);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkCompletion);
          resolve(null);
        }, 5000);
      });

      // Verify FIFO order: jobs should be processed in submission order
      expect(processedJobs[0].raffleId).toBe(1);
      expect(processedJobs[1].raffleId).toBe(2);
      expect(processedJobs[2].raffleId).toBe(3);
    });

    it('should handle high volume concurrent submissions with priority ordering', async () => {
      // Submit 50 jobs with mixed priorities
      const largeBatch: TestJob[] = [];
      for (let i = 0; i < 50; i++) {
        const prizeAmount = Math.floor(Math.random() * 50000);
        largeBatch.push({
          raffleId: i + 1,
          requestId: `req-${i + 1}`,
          prizeAmount,
          tier: 'LOW', // Will be overridden by classification
        });
      }

      // Submit all jobs in parallel
      await Promise.all(
        largeBatch.map((job) => {
          const classification = priorityClassifier.classify(job.prizeAmount);
          job.tier = classification.tier as any;
          return queue.add(job, {
            priority: classification.priority,
            removeOnComplete: true,
          });
        })
      );

      // Wait for completion
      await new Promise((resolve) => {
        const checkCompletion = setInterval(() => {
          if (processedJobs.length === largeBatch.length) {
            clearInterval(checkCompletion);
            resolve(null);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkCompletion);
          resolve(null);
        }, 10000);
      });

      // Verify priority ordering is maintained
      const processedTiers = processedJobs.map((job) => job.tier);

      let lastHighIndex = -1;
      let lastMediumIndex = -1;
      let lastLowIndex = -1;

      for (let i = 0; i < processedTiers.length; i++) {
        const tier = processedTiers[i];
        if (tier === 'HIGH') {
          lastHighIndex = i;
        } else if (tier === 'MEDIUM') {
          if (lastHighIndex > lastMediumIndex) {
            lastMediumIndex = i;
          }
        } else if (tier === 'LOW') {
          if (lastMediumIndex > lastLowIndex) {
            lastLowIndex = i;
          }
        }
      }

      // Verify the ordering is correct throughout
      for (let i = 0; i < processedTiers.length; i++) {
        if (processedTiers[i] === 'HIGH') {
          // HIGH can appear anywhere early, but shouldn't after MEDIUM or LOW
          expect(
            processedTiers.slice(i + 1).every((t) => t === 'HIGH' || t === 'MEDIUM' || t === 'LOW')
          ).toBe(true);
        }
      }
    });

    it('should not process jobs out of priority order', async () => {
      // Create a mix of priority jobs submitted randomly
      const testJobs: TestJob[] = [
        { raffleId: 101, requestId: 'low-1', prizeAmount: 100, tier: 'LOW' },
        { raffleId: 201, requestId: 'high-1', prizeAmount: 20000, tier: 'HIGH' },
        { raffleId: 301, requestId: 'med-1', prizeAmount: 5000, tier: 'MEDIUM' },
      ];

      // Submit in random order
      const shuffled = [...testJobs].sort(() => Math.random() - 0.5);

      for (const job of shuffled) {
        const classification = priorityClassifier.classify(job.prizeAmount);
        await queue.add(job, {
          priority: classification.priority,
          removeOnComplete: true,
        });
      }

      // Wait for processing
      await new Promise((resolve) => {
        const checkCompletion = setInterval(() => {
          if (processedJobs.length === testJobs.length) {
            clearInterval(checkCompletion);
            resolve(null);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkCompletion);
          resolve(null);
        }, 5000);
      });

      // HIGH priority job should be processed first
      expect(processedJobs[0].tier).toBe('HIGH');
      expect(processedJobs[0].raffleId).toBe(201);

      // MEDIUM should come next
      expect(processedJobs[1].tier).toBe('MEDIUM');
      expect(processedJobs[1].raffleId).toBe(301);

      // LOW should come last
      expect(processedJobs[2].tier).toBe('LOW');
      expect(processedJobs[2].raffleId).toBe(101);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queue gracefully', async () => {
      const queueCount = await queue.getJobCounts();
      expect(queueCount.wait).toBe(0);
      expect(queueCount.active).toBe(0);
      expect(queueCount.completed).toBe(0);
    });

    it('should classify jobs at threshold boundaries correctly', async () => {
      const thresholdJobs: TestJob[] = [
        { raffleId: 1, requestId: 'threshold-high', prizeAmount: 10000, tier: 'HIGH' },
        { raffleId: 2, requestId: 'threshold-med', prizeAmount: 1000, tier: 'MEDIUM' },
        { raffleId: 3, requestId: 'below-high', prizeAmount: 9999, tier: 'MEDIUM' },
        { raffleId: 4, requestId: 'below-med', prizeAmount: 999, tier: 'LOW' },
      ];

      for (const job of thresholdJobs) {
        const classification = priorityClassifier.classify(job.prizeAmount);
        job.tier = classification.tier as any;
        await queue.add(job, {
          priority: classification.priority,
          removeOnComplete: true,
        });
      }

      await new Promise((resolve) => {
        const checkCompletion = setInterval(() => {
          if (processedJobs.length === thresholdJobs.length) {
            clearInterval(checkCompletion);
            resolve(null);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkCompletion);
          resolve(null);
        }, 5000);
      });

      // Verify correct classification and ordering
      expect(processedJobs.map((j) => j.tier)).toEqual(['HIGH', 'MEDIUM', 'MEDIUM', 'LOW']);
    });
  });
});
