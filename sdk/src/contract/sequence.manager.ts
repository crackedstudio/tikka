/**
 * sequence.manager.ts
 *
 * SequenceManager — ensures single-threaded sequence number acquisition per account.
 *
 * Problem:
 *   When two operations (e.g., buy_ticket, cancel_raffle) fire concurrently from the same
 *   account, both may fetch the same sequence number from Horizon. One transaction succeeds,
 *   the other fails with TX_BAD_SEQ (bad sequence number). This is silent and unrecoverable
 *   in the current SDK because it looks like any other contract error.
 *
 * Solution:
 *   SequenceManager maintains a promise-based lock per account. Before fetching or
 *   incrementing sequence, a caller acquires the lock. Only one sequence fetch/increment
 *   happens per account at a time. Other callers wait for the first to finish, then
 *   they increment and use the next sequence number.
 *
 * Usage:
 *   const mgr = new SequenceManager();
 *   const release = await mgr.lock(accountId);
 *   try {
 *     const account = await horizon.loadAccount(accountId);
 *     // use account.sequenceNumber()
 *     account.incrementSequenceNumber();
 *   } finally {
 *     release();
 *   }
 */

/**
 * A function that releases a lock acquired via SequenceManager.lock().
 */
export type ReleaseLock = () => void;

/**
 * SequenceManager — per-account sequence-number safety via promise-based locking.
 *
 * Thread-safe mechanism that prevents concurrent sequence number acquisition collisions.
 * Each account gets its own promise queue; only one operation can hold the lock at a time.
 */
export class SequenceManager {
  /**
   * Map of account ID → pending promise.
   * Only one promise per account is active at a time.
   */
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquires a lock for the given account.
   * Blocks until the lock is available, then returns a release function.
   *
   * Usage pattern:
   * ```typescript
   * const release = await sequenceManager.lock(accountId);
   * try {
   *   // sequence-unsafe operation
   *   const account = await horizon.loadAccount(accountId);
   *   // ... use account
   * } finally {
   *   release();
   * }
   * ```
   *
   * @param accountId - Stellar account ID (public key)
   * @returns A function that releases the lock
   */
  async lock(accountId: string): Promise<ReleaseLock> {
    // Wait for any existing lock to finish
    const existingLock = this.locks.get(accountId);
    if (existingLock) {
      await existingLock;
    }

    // Create a new lock promise
    let releaseFn: ReleaseLock | undefined;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = () => {
        resolve();
        this.locks.delete(accountId);
      };
    });

    this.locks.set(accountId, lockPromise);

    // Return the release function to the caller
    return releaseFn!;
  }

  /**
   * Clears all pending locks (useful for testing or cleanup).
   */
  clear(): void {
    this.locks.clear();
  }

  /**
   * Returns the number of currently pending locks (for monitoring/debugging).
   */
  pendingLocks(): number {
    return this.locks.size;
  }
}
