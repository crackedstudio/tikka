import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from './circuit-breaker.service';
import { HealthService } from '../health/health.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  return {
    get: (key: string) => overrides[key],
  } as unknown as ConfigService;
}

function makeHealthService(): jest.Mocked<HealthService> {
  return {
    updateCircuitState: jest.fn(),
  } as unknown as jest.Mocked<HealthService>;
}

/** Build a CircuitBreakerService with a controllable clock. */
function makeService(
  configOverrides: Record<string, string | undefined> = {},
  nowFn?: () => number,
): { svc: CircuitBreakerService; health: jest.Mocked<HealthService> } {
  const health = makeHealthService();
  const config = makeConfigService(configOverrides);
  const svc = new CircuitBreakerService(config, health, nowFn);
  return { svc, health };
}

/** Drive the circuit from closed → open by recording N failures. */
function driveToOpen(svc: CircuitBreakerService, threshold: number): void {
  for (let i = 0; i < threshold; i++) {
    svc.recordFailure();
  }
}

/** Drive the circuit from closed → open → half-open using a mutable clock. */
function driveToHalfOpen(
  threshold: number,
  resetTimeoutMs: number,
): { svc: CircuitBreakerService; health: jest.Mocked<HealthService>; now: { value: number } } {
  const now = { value: 0 };
  const { svc, health } = makeService(
    {
      ORACLE_CB_FAILURE_THRESHOLD: String(threshold),
      ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs),
    },
    () => now.value,
  );
  driveToOpen(svc, threshold);
  // Advance past the reset timeout so canAttempt() transitions to half-open
  now.value = resetTimeoutMs;
  const allowed = svc.canAttempt(); // triggers open → half-open transition
  expect(allowed).toBe(true);
  expect(svc.getState()).toBe('half-open');
  return { svc, health, now };
}

// ---------------------------------------------------------------------------
// State machine — closed → open
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — closed → open', () => {
  it('starts in closed state', () => {
    const { svc } = makeService();
    expect(svc.getState()).toBe('closed');
  });

  it('canAttempt() returns true when closed', () => {
    const { svc } = makeService();
    expect(svc.canAttempt()).toBe(true);
  });

  it('stays closed while failures are below threshold', () => {
    const threshold = 5;
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: String(threshold) });
    for (let i = 0; i < threshold - 1; i++) {
      svc.recordFailure();
    }
    expect(svc.getState()).toBe('closed');
    expect(svc.canAttempt()).toBe(true);
  });

  it('transitions to open exactly at threshold', () => {
    const threshold = 3;
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: String(threshold) });
    driveToOpen(svc, threshold);
    expect(svc.getState()).toBe('open');
  });

  it('canAttempt() returns false immediately after opening', () => {
    const now = { value: 0 };
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: '60000' },
      () => now.value,
    );
    driveToOpen(svc, 3);
    expect(svc.canAttempt()).toBe(false);
  });

  it('notifies HealthService with "open" when circuit opens', () => {
    const { svc, health } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '2' });
    driveToOpen(svc, 2);
    expect(health.updateCircuitState).toHaveBeenCalledWith('open');
  });

  it('success in closed state resets consecutive failures', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '5' });
    svc.recordFailure();
    svc.recordFailure();
    svc.recordSuccess();
    // After reset, need 5 more failures to open
    svc.recordFailure();
    svc.recordFailure();
    svc.recordFailure();
    svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('notifies HealthService with "closed" on success in closed state', () => {
    const { svc, health } = makeService();
    svc.recordSuccess();
    expect(health.updateCircuitState).toHaveBeenCalledWith('closed');
  });
});

// ---------------------------------------------------------------------------
// State machine — open → half-open
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — open → half-open', () => {
  it('canAttempt() returns false while within reset timeout', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 60_000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = resetTimeoutMs - 1;
    expect(svc.canAttempt()).toBe(false);
    expect(svc.getState()).toBe('open');
  });

  it('transitions to half-open when reset timeout elapses', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 60_000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = resetTimeoutMs;
    svc.canAttempt();
    expect(svc.getState()).toBe('half-open');
  });

  it('canAttempt() returns true for the first call after timeout elapses', () => {
    const now = { value: 0 };
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: '1000' },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = 1000;
    expect(svc.canAttempt()).toBe(true);
  });

  it('getRemainingCooldownMs() returns correct value while open', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 60_000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = 10_000;
    expect(svc.getRemainingCooldownMs()).toBe(50_000);
  });

  it('getRemainingCooldownMs() returns 0 when timeout has elapsed', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 60_000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = resetTimeoutMs + 5000;
    expect(svc.getRemainingCooldownMs()).toBe(0);
  });

  it('getRemainingCooldownMs() returns 0 when circuit is closed', () => {
    const { svc } = makeService();
    expect(svc.getRemainingCooldownMs()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// State machine — half-open → closed
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — half-open → closed', () => {
  it('successful probe transitions half-open → closed', () => {
    const { svc } = driveToHalfOpen(3, 1000);
    svc.recordSuccess();
    expect(svc.getState()).toBe('closed');
  });

  it('notifies HealthService with "closed" after successful probe', () => {
    const { svc, health } = driveToHalfOpen(3, 1000);
    health.updateCircuitState.mockClear();
    svc.recordSuccess();
    expect(health.updateCircuitState).toHaveBeenCalledWith('closed');
  });

  it('resets consecutiveFailures after successful probe (needs full threshold to re-open)', () => {
    const threshold = 3;
    const { svc } = driveToHalfOpen(threshold, 1000);
    svc.recordSuccess();
    expect(svc.getState()).toBe('closed');
    // Need full threshold again to re-open
    for (let i = 0; i < threshold - 1; i++) {
      svc.recordFailure();
    }
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// State machine — half-open → open
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — half-open → open', () => {
  it('failed probe transitions half-open → open', () => {
    const { svc } = driveToHalfOpen(3, 1000);
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('notifies HealthService with "open" after failed probe', () => {
    const { svc, health } = driveToHalfOpen(3, 1000);
    health.updateCircuitState.mockClear();
    svc.recordFailure();
    expect(health.updateCircuitState).toHaveBeenCalledWith('open');
  });

  it('records a fresh openedAt timestamp on re-open', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 1000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '3', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    driveToOpen(svc, 3);
    now.value = resetTimeoutMs; // advance to trigger half-open
    svc.canAttempt();           // open → half-open; openedAt was 0
    // Re-open from half-open — new openedAt = resetTimeoutMs (1000)
    svc.recordFailure();        // half-open → open with new timestamp = 1000
    // Advance time by 200ms after the re-open
    now.value = resetTimeoutMs + 200;
    // Remaining cooldown = resetTimeoutMs - elapsed = 1000 - (1200 - 1000) = 800
    expect(svc.getRemainingCooldownMs()).toBe(resetTimeoutMs - 200);
  });

  it('canAttempt() returns false in half-open after probe slot consumed', () => {
    const { svc } = driveToHalfOpen(3, 1000);
    // probe slot was consumed in driveToHalfOpen; no outcome recorded yet
    expect(svc.canAttempt()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — config parsing', () => {
  it('uses default threshold (5) when ORACLE_CB_FAILURE_THRESHOLD is not set', () => {
    const { svc } = makeService({});
    for (let i = 0; i < 4; i++) svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('uses default resetTimeout (60000) when ORACLE_CB_RESET_TIMEOUT_MS is not set', () => {
    const now = { value: 0 };
    const { svc } = makeService({}, () => now.value);
    for (let i = 0; i < 5; i++) svc.recordFailure();
    now.value = 59_999;
    expect(svc.canAttempt()).toBe(false);
    now.value = 60_000;
    expect(svc.canAttempt()).toBe(true);
  });

  it('uses provided valid threshold', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '2' });
    svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('uses provided valid resetTimeout', () => {
    const now = { value: 0 };
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '1', ORACLE_CB_RESET_TIMEOUT_MS: '5000' }, () => now.value);
    svc.recordFailure();
    now.value = 4999;
    expect(svc.canAttempt()).toBe(false);
    now.value = 5000;
    expect(svc.canAttempt()).toBe(true);
  });

  it('falls back to default threshold when value is zero', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '0' });
    for (let i = 0; i < 4; i++) svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('falls back to default threshold when value is negative', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '-3' });
    for (let i = 0; i < 4; i++) svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('falls back to default threshold when value is a non-numeric string', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: 'abc' });
    for (let i = 0; i < 4; i++) svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('falls back to default threshold when value is empty string', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '' });
    for (let i = 0; i < 4; i++) svc.recordFailure();
    expect(svc.getState()).toBe('closed');
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('falls back to default resetTimeout when value is zero', () => {
    const now = { value: 0 };
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '1', ORACLE_CB_RESET_TIMEOUT_MS: '0' }, () => now.value);
    svc.recordFailure();
    now.value = 59_999;
    expect(svc.canAttempt()).toBe(false);
    now.value = 60_000;
    expect(svc.canAttempt()).toBe(true);
  });

  it('falls back to default resetTimeout when value is negative', () => {
    const now = { value: 0 };
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '1', ORACLE_CB_RESET_TIMEOUT_MS: '-100' }, () => now.value);
    svc.recordFailure();
    now.value = 59_999;
    expect(svc.canAttempt()).toBe(false);
    now.value = 60_000;
    expect(svc.canAttempt()).toBe(true);
  });

  it('falls back to default resetTimeout when value is non-numeric', () => {
    const now = { value: 0 };
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '1', ORACLE_CB_RESET_TIMEOUT_MS: 'bad' }, () => now.value);
    svc.recordFailure();
    now.value = 59_999;
    expect(svc.canAttempt()).toBe(false);
    now.value = 60_000;
    expect(svc.canAttempt()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Logging — warn/log/debug at each transition
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — logging', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits warn log when closed → open', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '2' });
    driveToOpen(svc, 2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/closed.*open|open.*closed/i);
  });

  it('warn log for closed → open includes threshold and resetTimeout', () => {
    const { svc } = makeService({
      ORACLE_CB_FAILURE_THRESHOLD: '3',
      ORACLE_CB_RESET_TIMEOUT_MS: '30000',
    });
    driveToOpen(svc, 3);
    const msg: string = warnSpy.mock.calls[0][0];
    expect(msg).toContain('3');
    expect(msg).toContain('30000');
  });

  it('emits log (info) when open → half-open', () => {
    const now = { value: 0 };
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '2', ORACLE_CB_RESET_TIMEOUT_MS: '1000' },
      () => now.value,
    );
    driveToOpen(svc, 2);
    now.value = 1000;
    svc.canAttempt();
    expect(logSpy).toHaveBeenCalled();
    const calls: string[] = logSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /half.?open/i.test(m))).toBe(true);
  });

  it('emits log (info) when half-open → closed', () => {
    const { svc } = driveToHalfOpen(2, 1000);
    logSpy.mockClear();
    svc.recordSuccess();
    expect(logSpy).toHaveBeenCalled();
    const calls: string[] = logSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /closed|recover/i.test(m))).toBe(true);
  });

  it('emits warn log when half-open → open', () => {
    const { svc } = driveToHalfOpen(2, 1000);
    warnSpy.mockClear();
    svc.recordFailure();
    expect(warnSpy).toHaveBeenCalled();
    const calls: string[] = warnSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /half.?open.*open|re.?open|probe.*fail/i.test(m))).toBe(true);
  });

  it('emits debug log when attempt is suppressed while open', () => {
    const now = { value: 0 };
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '2', ORACLE_CB_RESET_TIMEOUT_MS: '60000' },
      () => now.value,
    );
    driveToOpen(svc, 2);
    now.value = 1000; // still within timeout
    svc.canAttempt();
    expect(debugSpy).toHaveBeenCalled();
    const calls: string[] = debugSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /suppress|skip|open/i.test(m))).toBe(true);
  });

  it('debug log for suppressed attempt includes remaining cooldown', () => {
    const now = { value: 0 };
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '2', ORACLE_CB_RESET_TIMEOUT_MS: '60000' },
      () => now.value,
    );
    driveToOpen(svc, 2);
    now.value = 10_000;
    svc.canAttempt();
    const calls: string[] = debugSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => m.includes('50000'))).toBe(true);
  });

  it('emits warn log for invalid ORACLE_CB_FAILURE_THRESHOLD', () => {
    makeService({ ORACLE_CB_FAILURE_THRESHOLD: 'bad' });
    expect(warnSpy).toHaveBeenCalled();
    const calls: string[] = warnSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /ORACLE_CB_FAILURE_THRESHOLD/i.test(m))).toBe(true);
  });

  it('emits warn log for invalid ORACLE_CB_RESET_TIMEOUT_MS', () => {
    makeService({ ORACLE_CB_RESET_TIMEOUT_MS: '0' });
    expect(warnSpy).toHaveBeenCalled();
    const calls: string[] = warnSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((m) => /ORACLE_CB_RESET_TIMEOUT_MS/i.test(m))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getState() and getRemainingCooldownMs()
// ---------------------------------------------------------------------------

describe('CircuitBreakerService — getState() and getRemainingCooldownMs()', () => {
  it('getState() returns "closed" initially', () => {
    const { svc } = makeService();
    expect(svc.getState()).toBe('closed');
  });

  it('getState() returns "open" after threshold failures', () => {
    const { svc } = makeService({ ORACLE_CB_FAILURE_THRESHOLD: '1' });
    svc.recordFailure();
    expect(svc.getState()).toBe('open');
  });

  it('getState() returns "half-open" after timeout elapses', () => {
    const { svc } = driveToHalfOpen(1, 500);
    expect(svc.getState()).toBe('half-open');
  });

  it('getRemainingCooldownMs() returns 0 when closed', () => {
    const { svc } = makeService();
    expect(svc.getRemainingCooldownMs()).toBe(0);
  });

  it('getRemainingCooldownMs() returns 0 when half-open', () => {
    const { svc } = driveToHalfOpen(1, 500);
    expect(svc.getRemainingCooldownMs()).toBe(0);
  });

  it('getRemainingCooldownMs() returns correct remaining ms while open', () => {
    const now = { value: 0 };
    const resetTimeoutMs = 10_000;
    const { svc } = makeService(
      { ORACLE_CB_FAILURE_THRESHOLD: '1', ORACLE_CB_RESET_TIMEOUT_MS: String(resetTimeoutMs) },
      () => now.value,
    );
    svc.recordFailure();
    now.value = 3_000;
    expect(svc.getRemainingCooldownMs()).toBe(7_000);
  });
});
