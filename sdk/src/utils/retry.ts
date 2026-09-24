import type {
  RetryConfig,
  RetryDecision,
  RetryAttemptInfo,
  RetryJitter,
} from '../network/network.config';
import { DEFAULT_RETRY_CONFIG, classifySorobanRpcError } from '../network/network.config';

/** Symbol under which the final classification is attached to a thrown error. */
const RETRY_DECISION = Symbol('tikka.retryDecision');

/**
 * Reads the {@link RetryDecision} attached by `withRetry` to a previously thrown
 * error. Higher-level callers use this to detect e.g. a `refreshSequence`
 * failure and refresh the account sequence before re-submitting.
 */
export function getRetryDecision(error: unknown): RetryDecision | undefined {
  if (error && typeof error === 'object') {
    return (error as Record<symbol, RetryDecision>)[RETRY_DECISION];
  }
  return undefined;
}

function attachRetryDecision(error: unknown, decision: RetryDecision, attempt: number): void {
  if (error && typeof error === 'object') {
    const obj = error as Record<symbol | string, unknown>;
    obj[RETRY_DECISION] = decision;
    obj.retryAttempt = attempt;
  }
}

/** Applies the configured jitter strategy to a capped backoff value (ms). */
function applyJitter(cap: number, jitter: RetryJitter): number {
  if (jitter === 'full') return cap * Math.random();
  if (jitter === 'equal') return cap / 2 + (cap / 2) * Math.random();
  const j = Math.min(1, Math.max(0, jitter));
  return cap * (1 - j) + cap * j * Math.random();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with exponential backoff and jitter, retrying only
 * when the configured {@link RetryConfig.classifyError} predicate allows it.
 *
 * The default policy ({@link DEFAULT_RETRY_CONFIG}) retries Soroban RPC
 * transient failures (TRY_AGAIN_LATER, 5xx, rate limits, transport errors) and
 * treats malformed XDR / contract failures as fatal.
 *
 * When retries are exhausted (or the error is non-retryable), the last error is
 * re-thrown with its {@link RetryDecision} attached via {@link getRetryDecision}.
 *
 * @param fn   Async operation to attempt.
 * @param config Retry / backoff policy. Defaults to {@link DEFAULT_RETRY_CONFIG}.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  const {
    maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts!,
    baseDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs!,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs!,
    jitter = DEFAULT_RETRY_CONFIG.jitter!,
    classifyError = DEFAULT_RETRY_CONFIG.classifyError ?? classifySorobanRpcError,
    onRetry,
  } = config;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      const decision = classifyError(error);

      if (attempt >= maxAttempts || !decision.retry) {
        attachRetryDecision(error, decision, attempt);
        throw error;
      }

      // Exponential backoff: base * 2^(attempt-1), capped at maxDelayMs.
      const backoff = Math.pow(2, attempt - 1);
      const cap = Math.min(maxDelayMs, baseDelayMs * backoff);
      const delay = applyJitter(cap, jitter);

      const info: RetryAttemptInfo = { attempt, error, delayMs: delay, decision };
      if (onRetry) {
        onRetry(info);
      } else {
        console.debug(
          `[withRetry] Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await sleep(delay);
    }
  }

  throw lastError;
}
