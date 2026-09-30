export class BackfillLockError extends Error {
  constructor(message?: string) {
    super(message ?? 'Backfill lock is already held — another backfill or the active poller is running');
    this.name = 'BackfillLockError';
  }
}

export interface BackfillLockOptions {
  /**
   * How long (ms) a held lock may live before it is considered stale and can be
   * re-acquired. This bounds the damage a crashed process can do: without a TTL
   * a process that dies mid-backfill would block every future backfill forever.
   */
  ttlMs?: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class BackfillLock {
  private locked = false;
  private acquiredAt = 0;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: BackfillLockOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Attempt to take the lock. Returns false when another (non-stale) holder is
   * active. A lock whose TTL has elapsed is treated as stale and reclaimed, so
   * a crashed process cannot block backfill indefinitely.
   */
  tryAcquire(): boolean {
    if (this.locked && !this.isStale()) return false;
    this.locked = true;
    this.acquiredAt = this.now();
    return true;
  }

  release(): void {
    this.locked = false;
    this.acquiredAt = 0;
  }

  isLocked(): boolean {
    return this.locked && !this.isStale();
  }

  /** True when a lock is held but its TTL has elapsed (crashed holder). */
  isStale(): boolean {
    return this.locked && this.now() - this.acquiredAt >= this.ttlMs;
  }

  /** Milliseconds remaining before the current lock goes stale (0 if unlocked). */
  ttlRemainingMs(): number {
    if (!this.locked) return 0;
    return Math.max(0, this.ttlMs - (this.now() - this.acquiredAt));
  }
}
