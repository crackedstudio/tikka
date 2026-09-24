export class BackfillLockError extends Error {
  constructor(message?: string) {
    super(message ?? 'Backfill lock is already held — another backfill or the active poller is running');
    this.name = 'BackfillLockError';
  }
}

export class BackfillLock {
  private locked = false;

  tryAcquire(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }
}
