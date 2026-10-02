/**
 * sequence.manager.spec.ts
 *
 * Tests for SequenceManager — per-account sequence locking.
 *
 * Coverage:
 *   - Single lock: acquisition, release, re-acquisition
 *   - Concurrent locks on same account: serialization, FIFO ordering
 *   - Concurrent locks on different accounts: parallelism
 *   - Lock cleanup: locks are removed after release
 *   - Error handling: lock released even if operation throws
 */

import { SequenceManager } from './sequence.manager';

describe('SequenceManager', () => {
  let sequenceManager: SequenceManager;

  beforeEach(() => {
    sequenceManager = new SequenceManager();
  });

  describe('single account locking', () => {
    it('should acquire and release a lock', async () => {
      const accountId = 'ACCOUNT_A';
      const release = await sequenceManager.lock(accountId);

      expect(typeof release).toBe('function');
      expect(sequenceManager.pendingLocks()).toBe(1);

      release();
      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should allow re-acquisition after release', async () => {
      const accountId = 'ACCOUNT_A';

      const release1 = await sequenceManager.lock(accountId);
      release1();

      const release2 = await sequenceManager.lock(accountId);
      expect(sequenceManager.pendingLocks()).toBe(1);
      release2();

      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should handle multiple sequential locks', async () => {
      const accountId = 'ACCOUNT_A';
      const sequence: string[] = [];

      for (let i = 0; i < 3; i++) {
        const release = await sequenceManager.lock(accountId);
        sequence.push('acquired');
        expect(sequenceManager.pendingLocks()).toBe(1);
        release();
        sequence.push('released');
        expect(sequenceManager.pendingLocks()).toBe(0);
      }

      expect(sequence).toEqual(['acquired', 'released', 'acquired', 'released', 'acquired', 'released']);
    });
  });

  describe('concurrent locks on same account', () => {
    it('should serialize concurrent lock requests (FIFO)', async () => {
      const accountId = 'ACCOUNT_A';
      const executionOrder: number[] = [];
      let lockCount = 0;

      // Kick off two concurrent lock requests
      const promise1 = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(1);
        lockCount++;
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 10));
        release();
        lockCount--;
      })();

      // Small delay to ensure first request starts first
      await new Promise((resolve) => setTimeout(resolve, 5));

      const promise2 = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(2);
        lockCount++;
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 10));
        release();
        lockCount--;
      })();

      await Promise.all([promise1, promise2]);

      // Both operations should complete, executed serially
      expect(executionOrder).toEqual([1, 2]);
    });

    it('should never allow two concurrent operations on same account', async () => {
      const accountId = 'ACCOUNT_A';
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const operation = async () => {
        const release = await sequenceManager.lock(accountId);
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);

        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 20));

        concurrentCount--;
        release();
      };

      // Fire 5 concurrent operations
      await Promise.all([operation(), operation(), operation(), operation(), operation()]);

      // Should never have had more than 1 concurrent
      expect(maxConcurrent).toBe(1);
    });

    it('should maintain order under heavy concurrency', async () => {
      const accountId = 'ACCOUNT_A';
      const executionOrder: number[] = [];

      const operations = Array.from({ length: 10 }, (_, i) => async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(i);
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        release();
      });

      await Promise.all(operations.map((op) => op()));

      // Should execute in order
      expect(executionOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle lock release even when operation throws', async () => {
      const accountId = 'ACCOUNT_A';

      try {
        const release = await sequenceManager.lock(accountId);
        expect(sequenceManager.pendingLocks()).toBe(1);
        release();
        throw new Error('simulated error');
      } catch (e) {
        // expected
      }

      // Lock should be cleaned up
      expect(sequenceManager.pendingLocks()).toBe(0);

      // Should be able to acquire again
      const release = await sequenceManager.lock(accountId);
      expect(sequenceManager.pendingLocks()).toBe(1);
      release();
    });

    it('should queue waiters correctly when first lock is held long', async () => {
      const accountId = 'ACCOUNT_A';
      const executionOrder: number[] = [];

      // Start a long-running first operation
      const longOp = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(1);
        await new Promise((resolve) => setTimeout(resolve, 50));
        release();
      })();

      // Wait for it to acquire the lock
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Queue up several waiters
      const waiter1 = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(2);
        release();
      })();

      const waiter2 = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(3);
        release();
      })();

      const waiter3 = (async () => {
        const release = await sequenceManager.lock(accountId);
        executionOrder.push(4);
        release();
      })();

      await Promise.all([longOp, waiter1, waiter2, waiter3]);

      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });
  });

  describe('concurrent locks on different accounts', () => {
    it('should allow parallel locks on different accounts', async () => {
      const accountA = 'ACCOUNT_A';
      const accountB = 'ACCOUNT_B';
      const executionOrder: string[] = [];

      const opA = (async () => {
        const release = await sequenceManager.lock(accountA);
        executionOrder.push('A_start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push('A_end');
        release();
      })();

      const opB = (async () => {
        const release = await sequenceManager.lock(accountB);
        executionOrder.push('B_start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push('B_end');
        release();
      })();

      await Promise.all([opA, opB]);

      // Both should have started nearly simultaneously (interleaved)
      expect(executionOrder).toContain('A_start');
      expect(executionOrder).toContain('B_start');
      // The exact order depends on timing, but both should start before either finishes
      const aStartIdx = executionOrder.indexOf('A_start');
      const bStartIdx = executionOrder.indexOf('B_start');
      const aEndIdx = executionOrder.indexOf('A_end');
      const bEndIdx = executionOrder.indexOf('B_end');

      expect(aStartIdx).toBeLessThan(aEndIdx);
      expect(bStartIdx).toBeLessThan(bEndIdx);
      // At least one operation should start before the other finishes (parallel)
      expect(Math.min(aStartIdx, bStartIdx)).toBeLessThan(Math.max(aEndIdx, bEndIdx));
    });

    it('should maintain independent lock state per account', async () => {
      const accountA = 'ACCOUNT_A';
      const accountB = 'ACCOUNT_B';
      const accountC = 'ACCOUNT_C';

      const releaseA = await sequenceManager.lock(accountA);
      expect(sequenceManager.pendingLocks()).toBe(1);

      const releaseB = await sequenceManager.lock(accountB);
      expect(sequenceManager.pendingLocks()).toBe(2);

      const releaseC = await sequenceManager.lock(accountC);
      expect(sequenceManager.pendingLocks()).toBe(3);

      releaseA();
      expect(sequenceManager.pendingLocks()).toBe(2);

      releaseB();
      expect(sequenceManager.pendingLocks()).toBe(1);

      releaseC();
      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should serialize on same account while parallelizing different accounts', async () => {
      const accountA = 'ACCOUNT_A';
      const accountB = 'ACCOUNT_B';
      const timing: string[] = [];

      // Two operations on account A
      const opA1 = (async () => {
        const release = await sequenceManager.lock(accountA);
        timing.push('A1_acquired');
        await new Promise((resolve) => setTimeout(resolve, 10));
        timing.push('A1_released');
        release();
      })();

      const opA2 = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5)); // Let A1 start first
        const release = await sequenceManager.lock(accountA);
        timing.push('A2_acquired');
        await new Promise((resolve) => setTimeout(resolve, 10));
        timing.push('A2_released');
        release();
      })();

      // One operation on account B
      const opB1 = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 2)); // Start very quickly
        const release = await sequenceManager.lock(accountB);
        timing.push('B1_acquired');
        await new Promise((resolve) => setTimeout(resolve, 10));
        timing.push('B1_released');
        release();
      })();

      await Promise.all([opA1, opA2, opB1]);

      // B1 should have acquired while A1 held (parallel)
      expect(timing.indexOf('B1_acquired')).toBeGreaterThan(timing.indexOf('A1_acquired'));
      expect(timing.indexOf('B1_acquired')).toBeLessThan(timing.indexOf('A1_released'));

      // A2 should only acquire after A1 releases
      expect(timing.indexOf('A2_acquired')).toBeGreaterThan(timing.indexOf('A1_released'));
    });
  });

  describe('lock state management', () => {
    it('should report correct pending lock count', async () => {
      expect(sequenceManager.pendingLocks()).toBe(0);

      const release1 = await sequenceManager.lock('ACCOUNT_A');
      expect(sequenceManager.pendingLocks()).toBe(1);

      const release2 = await sequenceManager.lock('ACCOUNT_B');
      expect(sequenceManager.pendingLocks()).toBe(2);

      release1();
      expect(sequenceManager.pendingLocks()).toBe(1);

      release2();
      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should clear all locks', async () => {
      const release1 = await sequenceManager.lock('ACCOUNT_A');
      const release2 = await sequenceManager.lock('ACCOUNT_B');

      expect(sequenceManager.pendingLocks()).toBe(2);

      sequenceManager.clear();
      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should allow operations after clear', async () => {
      const release1 = await sequenceManager.lock('ACCOUNT_A');
      sequenceManager.clear();

      // Should be able to acquire new locks
      const release2 = await sequenceManager.lock('ACCOUNT_A');
      expect(sequenceManager.pendingLocks()).toBe(1);
      release2();
    });
  });

  describe('edge cases', () => {
    it('should handle empty account ID', async () => {
      const release = await sequenceManager.lock('');
      expect(sequenceManager.pendingLocks()).toBe(1);
      release();
      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should handle very long account ID', async () => {
      const longId = 'G' + 'A'.repeat(55);
      const release = await sequenceManager.lock(longId);
      expect(sequenceManager.pendingLocks()).toBe(1);
      release();
    });

    it('should handle rapid acquire/release cycles', async () => {
      const accountId = 'ACCOUNT_A';
      const cycles = 100;

      for (let i = 0; i < cycles; i++) {
        const release = await sequenceManager.lock(accountId);
        release();
      }

      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should handle lock called multiple times before release', async () => {
      const accountId = 'ACCOUNT_A';
      const release1 = await sequenceManager.lock(accountId);

      // Try to lock again (should wait)
      let release2Resolved = false;
      const promise2 = sequenceManager.lock(accountId).then((release) => {
        release2Resolved = true;
        return release;
      });

      // Give promise2 time to start waiting
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(release2Resolved).toBe(false);

      // Release the first lock
      release1();

      // Now promise2 should resolve
      const release2 = await promise2;
      expect(release2Resolved).toBe(true);
      release2();
    });
  });

  describe('integration: lock release in try/finally', () => {
    it('should always release lock even if wrapped operation throws', async () => {
      const accountId = 'ACCOUNT_A';

      try {
        const release = await sequenceManager.lock(accountId);
        try {
          throw new Error('operation failed');
        } finally {
          release();
        }
      } catch (e) {
        // expected
      }

      expect(sequenceManager.pendingLocks()).toBe(0);
    });

    it('should recover after exception and allow new locks', async () => {
      const accountId = 'ACCOUNT_A';
      let executedSecond = false;

      try {
        const release = await sequenceManager.lock(accountId);
        try {
          throw new Error('first operation failed');
        } finally {
          release();
        }
      } catch (e) {
        // expected
      }

      // Should be able to acquire lock again
      const release = await sequenceManager.lock(accountId);
      executedSecond = true;
      release();

      expect(executedSecond).toBe(true);
      expect(sequenceManager.pendingLocks()).toBe(0);
    });
  });
});
