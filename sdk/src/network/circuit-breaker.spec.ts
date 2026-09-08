import { CircuitBreaker, type CircuitState } from './circuit-breaker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBreaker(
  opts: { failureThreshold?: number; resetTimeoutMs?: number; now?: () => number } = {},
  hooks?: CircuitBreaker['hooks'],
): { breaker: CircuitBreaker; now: { value: number } } {
  const now = opts.now ? { value: null as unknown as number } : { value: 0 };
  const nowFn = opts.now ?? (() => now.value);
  const breaker = new CircuitBreaker({
    failureThreshold: opts.failureThreshold ?? 5,
    resetTimeoutMs: opts.resetTimeoutMs ?? 60_000,
    now: nowFn,
    hooks,
  });
  return { breaker, now };
}

/** Drive closed → open by recording `threshold` failures. */
function driveToOpen(breaker: CircuitBreaker, threshold: number): void {
  for (let i = 0; i < threshold; i++) {
    breaker.recordFailure();
  }
}

/** Drive closed → open → half-open by elapsing the reset timeout. */
function driveToHalfOpen(
  threshold: number,
  resetTimeoutMs: number,
): { breaker: CircuitBreaker; now: { value: number } } {
  const { breaker, now } = makeBreaker({ failureThreshold: threshold, resetTimeoutMs });
  driveToOpen(breaker, threshold);
  now.value = resetTimeoutMs;
  const allowed = breaker.canAttempt(); // open → half-open, consumes probe slot
  expect(allowed).toBe(true);
  expect(breaker.getState()).toBe('half-open');
  return { breaker, now };
}

// ---------------------------------------------------------------------------
// closed → open
// ---------------------------------------------------------------------------

describe('CircuitBreaker — closed → open', () => {
  it('starts in closed state', () => {
    const { breaker } = makeBreaker();
    expect(breaker.getState()).toBe('closed');
  });

  it('canAttempt() returns true when closed', () => {
    const { breaker } = makeBreaker();
    expect(breaker.canAttempt()).toBe(true);
  });

  it('stays closed while failures are below threshold', () => {
    const threshold = 5;
    const { breaker } = makeBreaker({ failureThreshold: threshold });
    for (let i = 0; i < threshold - 1; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('transitions to open exactly at threshold', () => {
    const threshold = 3;
    const { breaker } = makeBreaker({ failureThreshold: threshold });
    driveToOpen(breaker, threshold);
    expect(breaker.getState()).toBe('open');
  });

  it('canAttempt() returns false immediately after opening', () => {
    const { breaker } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    driveToOpen(breaker, 3);
    expect(breaker.canAttempt()).toBe(false);
  });

  it('success in closed state resets consecutive failures', () => {
    const { breaker } = makeBreaker({ failureThreshold: 5 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('emits onStateChange(closed, open) when the circuit opens', () => {
    const seen: Array<[CircuitState, CircuitState]> = [];
    const { breaker } = makeBreaker(
      { failureThreshold: 2 },
      { onStateChange: (from, to) => seen.push([from, to]) },
    );
    driveToOpen(breaker, 2);
    expect(seen).toContainEqual(['closed', 'open']);
  });
});

// ---------------------------------------------------------------------------
// open → half-open
// ---------------------------------------------------------------------------

describe('CircuitBreaker — open → half-open', () => {
  it('canAttempt() returns false while within reset timeout', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    driveToOpen(breaker, 3);
    now.value = 59_999;
    expect(breaker.canAttempt()).toBe(false);
    expect(breaker.getState()).toBe('open');
  });

  it('transitions to half-open when reset timeout elapses', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    driveToOpen(breaker, 3);
    now.value = 60_000;
    breaker.canAttempt();
    expect(breaker.getState()).toBe('half-open');
  });

  it('canAttempt() returns true for the first call after timeout elapses', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000 });
    driveToOpen(breaker, 3);
    now.value = 1_000;
    expect(breaker.canAttempt()).toBe(true);
  });

  it('getRemainingCooldownMs() returns correct value while open', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    driveToOpen(breaker, 3);
    now.value = 10_000;
    expect(breaker.getRemainingCooldownMs()).toBe(50_000);
  });

  it('getRemainingCooldownMs() returns 0 when timeout has elapsed', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    driveToOpen(breaker, 3);
    now.value = 65_000;
    expect(breaker.getRemainingCooldownMs()).toBe(0);
  });

  it('getRemainingCooldownMs() returns 0 when circuit is closed', () => {
    const { breaker } = makeBreaker();
    expect(breaker.getRemainingCooldownMs()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// half-open → closed
// ---------------------------------------------------------------------------

describe('CircuitBreaker — half-open → closed', () => {
  it('successful probe transitions half-open → closed', () => {
    const { breaker } = driveToHalfOpen(3, 1_000);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
  });

  it('resets failure count after successful probe (needs full threshold to re-open)', () => {
    const threshold = 3;
    const { breaker } = driveToHalfOpen(threshold, 1_000);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
    for (let i = 0; i < threshold - 1; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// half-open → open
// ---------------------------------------------------------------------------

describe('CircuitBreaker — half-open → open', () => {
  it('failed probe transitions half-open → open', () => {
    const { breaker } = driveToHalfOpen(3, 1_000);
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('records a fresh remaining cooldown on re-open', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000 });
    driveToOpen(breaker, 3);
    now.value = 1_000;
    breaker.canAttempt(); // open → half-open
    breaker.recordFailure(); // half-open → open, openedAt = 1000
    now.value = 1_200;
    // elapsed = 200ms, remaining = 1000 - 200 = 800
    expect(breaker.getRemainingCooldownMs()).toBe(800);
  });

  it('canAttempt() returns false in half-open after probe slot consumed', () => {
    const { breaker } = driveToHalfOpen(3, 1_000);
    expect(breaker.canAttempt()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

describe('CircuitBreaker — getters', () => {
  it('getFailureCount() reflects recorded failures and resets on success', () => {
    const { breaker } = makeBreaker();
    expect(breaker.getFailureCount()).toBe(0);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getFailureCount()).toBe(2);
    breaker.recordSuccess();
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('getLastFailureAt() returns the timestamp of the last failure', () => {
    const { breaker, now } = makeBreaker();
    expect(breaker.getLastFailureAt()).toBeNull();
    now.value = 42;
    breaker.recordFailure();
    expect(breaker.getLastFailureAt()).toBe(42);
  });

  it('getState() returns half-open after timeout elapses via canAttempt()', () => {
    const { breaker } = driveToHalfOpen(1, 500);
    expect(breaker.getState()).toBe('half-open');
  });

  it('refresh() promotes to half-open without consuming the probe slot', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 500 });
    breaker.recordFailure();
    now.value = 500;
    breaker.refresh();
    expect(breaker.getState()).toBe('half-open');
    // Probe slot should still be available
    expect(breaker.canAttempt()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

describe('CircuitBreaker — hooks', () => {
  it('emits onStateChange(open, half-open) when timeout elapses', () => {
    const seen: Array<[CircuitState, CircuitState]> = [];
    const { breaker, now } = makeBreaker(
      { failureThreshold: 2, resetTimeoutMs: 1_000 },
      { onStateChange: (from, to) => seen.push([from, to]) },
    );
    driveToOpen(breaker, 2);
    now.value = 1_000;
    breaker.canAttempt();
    expect(seen).toContainEqual(['open', 'half-open']);
  });

  it('emits onStateChange(half-open, closed) on successful probe', () => {
    const seen: Array<[CircuitState, CircuitState]> = [];
    const { breaker, now } = makeBreaker(
      { failureThreshold: 2, resetTimeoutMs: 1_000 },
      { onStateChange: (from, to) => seen.push([from, to]) },
    );
    driveToOpen(breaker, 2);
    now.value = 1_000;
    breaker.canAttempt(); // → half-open
    seen.length = 0;
    breaker.recordSuccess();
    expect(seen).toContainEqual(['half-open', 'closed']);
  });

  it('emits onStateChange(half-open, open) on failed probe', () => {
    const seen: Array<[CircuitState, CircuitState]> = [];
    const { breaker, now } = makeBreaker(
      { failureThreshold: 2, resetTimeoutMs: 1_000 },
      { onStateChange: (from, to) => seen.push([from, to]) },
    );
    driveToOpen(breaker, 2);
    now.value = 1_000;
    breaker.canAttempt(); // → half-open
    seen.length = 0;
    breaker.recordFailure();
    expect(seen).toContainEqual(['half-open', 'open']);
  });

  it('onAttemptSuppressed receives remaining cooldown while open', () => {
    const suppressed: number[] = [];
    const { breaker, now } = makeBreaker(
      { failureThreshold: 2, resetTimeoutMs: 60_000 },
      { onAttemptSuppressed: (remaining) => suppressed.push(remaining) },
    );
    driveToOpen(breaker, 2);
    now.value = 10_000;
    breaker.canAttempt();
    expect(suppressed).toEqual([50_000]); // 60_000 - 10_000
  });

  it('updateConfig() changes thresholds without resetting state', () => {
    const { breaker, now } = makeBreaker({ failureThreshold: 5, resetTimeoutMs: 60_000 });
    breaker.updateConfig({ failureThreshold: 2, resetTimeoutMs: 5_000 });
    driveToOpen(breaker, 2);
    expect(breaker.getState()).toBe('open');
    now.value = 5_000;
    expect(breaker.canAttempt()).toBe(true);
  });
});