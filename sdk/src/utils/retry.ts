export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (number | string)[];
  onRetry?: (attempt: number, error: any, delay: number) => void;
}

/**
 * Executes an async function with exponential backoff and jitter.
 * 
 * Default options:
 * - maxAttempts: 3
 * - baseDelayMs: 500
 * - maxDelayMs: 8000
 * - retryOn: [503, 429, 'ECONNRESET']
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    retryOn = [503, 429, 'ECONNRESET'],
    onRetry,
  } = opts;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      const status = error?.status ?? error?.cause?.status;
      const code = error?.code;
      const message = error?.message ?? '';

      const isRetryable = retryOn.some((trigger) => {
        if (typeof trigger === 'number') return status === trigger;
        return code === trigger || message.includes(trigger);
      });

      if (attempt >= maxAttempts || !isRetryable) {
        throw error;
      }

      // Exponential backoff with jitter: delay = min(maxDelay, base * 2^(attempt-1) * (0.5 + random))
      const backoff = Math.pow(2, attempt - 1);
      const jitter = 0.5 + Math.random();
      const delay = Math.min(maxDelayMs, baseDelayMs * backoff * jitter);

      if (onRetry) {
        onRetry(attempt, error, delay);
      } else {
        console.debug(
          `[withRetry] Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms: ${message}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
