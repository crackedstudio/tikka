import { withRetry, getRetryDecision } from './retry';
import type { RetryConfig, RetryDecision } from '../network/network.config';

/** A config that retries everything, with zero jitter for deterministic timing. */
const fastRetryAll: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 1_000,
  jitter: 0,
  classifyError: () => ({ retry: true, reason: 'retryable' }) as RetryDecision,
};

/** A config that never retries. */
const fatalConfig: RetryConfig = {
  ...fastRetryAll,
  classifyError: () => ({ retry: false, reason: 'fatal' }) as RetryDecision,
};

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns immediately on first-try success without sleeping', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const onRetry = jest.fn();

    const result = await withRetry(fn, { ...fastRetryAll, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('succeeds after N retries and honours the backoff schedule', async () => {
    let calls = 0;
    const delays: number[] = [];
    const onRetry = jest.fn((info: { delayMs: number }) => {
      delays.push(info.delayMs);
    });

    const promise = withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { ...fastRetryAll, onRetry },
    );

    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([10, 20]);
  });

  it('caps backoff at maxDelayMs', async () => {
    let calls = 0;
    const delays: number[] = [];

    const promise = withRetry(
      async () => {
        calls++;
        throw new Error('always');
      },
      {
        ...fastRetryAll,
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 150,
        onRetry: (info: { delayMs: number }) => delays.push(info.delayMs),
      },
    ).catch((e) => e);

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(150);
    await jest.advanceTimersByTimeAsync(150);
    await promise;

    expect(delays).toEqual([100, 150, 150]);
    expect(calls).toBe(4);
  });

  it('exhausts after maxAttempts and re-throws the last error', async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error('always');
      },
      { ...fastRetryAll, maxAttempts: 2 },
    ).catch((e) => e);

    await jest.advanceTimersByTimeAsync(10);
    const err = await promise;

    expect(calls).toBe(2);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('always');
  });

  it('short-circuits immediately on a non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fatal'));
    const onRetry = jest.fn();

    await expect(
      withRetry(fn, { ...fatalConfig, onRetry }),
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('attaches the classification to the final error via getRetryDecision', async () => {
    const decision: RetryDecision = { retry: false, reason: 'fatal' };
    const err = await withRetry(
      async () => {
        throw new Error('boom');
      },
      { ...fastRetryAll, classifyError: () => decision },
    ).catch((e) => e);

    expect(getRetryDecision(err)).toEqual(decision);
    expect((err as { retryAttempt?: number }).retryAttempt).toBe(1);
  });

  it('returns undefined from getRetryDecision for errors never passed through withRetry', () => {
    expect(getRetryDecision(new Error('plain'))).toBeUndefined();
    expect(getRetryDecision(undefined)).toBeUndefined();
    expect(getRetryDecision('string')).toBeUndefined();
  });

  // ─── Double-submit safety ──────────────────────────────────────────────────
  // Retry must not re-invoke a non-retryable operation. The SDK's submission
  // path classifies TransactionRejected (and ambiguous timeouts) as fatal so
  // this loop never re-submits. This test locks that property in at the retry
  // layer: given a fatal decision, fn is invoked exactly once regardless of
  // how high maxAttempts is set.
  it('never re-invokes fn when the error is classified fatal (double-submit guard)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fatal-submit'));

    await expect(
      withRetry(fn, {
        maxAttempts: 10,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitter: 0,
        classifyError: () => ({ retry: false, reason: 'fatal' }),
      }),
    ).rejects.toThrow('fatal-submit');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry jitter bounds', () => {
  /** Collect the delay scheduled on each retry attempt. */
  async function collectDelays(
    jitter: number | 'full' | 'equal',
    base: number,
  ): Promise<number[]> {
    const delays: number[] = [];
    const promise = withRetry(
      async () => {
        throw new Error('always');
      },
      {
        maxAttempts: 2,
        baseDelayMs: base,
        maxDelayMs: base,
        jitter,
        classifyError: () => ({ retry: true, reason: 'retryable' }),
        onRetry: (info: { delayMs: number }) => delays.push(info.delayMs),
      },
    ).catch(() => undefined);
    await promise;
    return delays;
  }

  it('jitter="full" produces delay in [0, cap]', async () => {
    for (let i = 0; i < 50; i++) {
      const [delay] = await collectDelays('full', 100);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(100);
    }
  });

  it('jitter="equal" produces delay in [cap/2, cap]', async () => {
    for (let i = 0; i < 50; i++) {
      const [delay] = await collectDelays('equal', 100);
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(100);
    }
  });

  it('numeric jitter (0.25) produces delay in [cap*0.75, cap]', async () => {
    for (let i = 0; i < 50; i++) {
      const [delay] = await collectDelays(0.25, 100);
      expect(delay).toBeGreaterThanOrEqual(75);
      expect(delay).toBeLessThanOrEqual(100);
    }
  });

  it('numeric jitter is clamped to [0, 1]', async () => {
    // -1 clamps to 0 → delay must be exactly cap.
    for (let i = 0; i < 10; i++) {
      const [delayNeg] = await collectDelays(-1 as unknown as number, 100);
      expect(delayNeg).toBeCloseTo(100, 5);
    }
    // 2 clamps to 1 → delay must be in [0, cap].
    for (let i = 0; i < 10; i++) {
      const [delayOver] = await collectDelays(2 as unknown as number, 100);
      expect(delayOver).toBeGreaterThanOrEqual(0);
      expect(delayOver).toBeLessThanOrEqual(100);
    }
  });
});