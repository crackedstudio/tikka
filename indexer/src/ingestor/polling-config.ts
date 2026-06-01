/**
 * Adaptive polling configuration for ledger ingestion.
 * 
 * The poller adapts its behavior based on:
 * - Lag: How far behind the latest ledger we are
 * - Rate limits: HTTP 429 responses from Horizon/RPC
 * - Errors: Transient failures that warrant backoff
 */
export interface PollingConfig {
  /** Minimum poll interval in milliseconds (when caught up) */
  minIntervalMs: number;

  /** Maximum poll interval in milliseconds (when heavily lagged) */
  maxIntervalMs: number;

  /** Maximum events to fetch per poll */
  maxBatchSize: number;

  /** Lag threshold (ledgers) above which we speed up polling */
  lagThresholdLedgers: number;

  /** Backoff multiplier for rate limit errors (429) */
  rateLimitBackoffMultiplier: number;

  /** Backoff multiplier for transient errors */
  transientErrorBackoffMultiplier: number;

  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;

  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;
}

/**
 * Default polling configuration.
 * 
 * - minIntervalMs: 500ms - Poll frequently when caught up
 * - maxIntervalMs: 30000ms - Don't wait more than 30s when heavily lagged
 * - maxBatchSize: 100 - Fetch up to 100 events per poll
 * - lagThresholdLedgers: 50 - Speed up if more than 50 ledgers behind
 * - rateLimitBackoffMultiplier: 2.0 - Double backoff on rate limits
 * - transientErrorBackoffMultiplier: 1.5 - 1.5x backoff on transient errors
 * - maxBackoffMs: 60000ms - Cap backoff at 60 seconds
 * - initialBackoffMs: 1000ms - Start with 1 second backoff
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  minIntervalMs: 500,
  maxIntervalMs: 30000,
  maxBatchSize: 100,
  lagThresholdLedgers: 50,
  rateLimitBackoffMultiplier: 2.0,
  transientErrorBackoffMultiplier: 1.5,
  maxBackoffMs: 60000,
  initialBackoffMs: 1000,
};

/**
 * Calculate the next poll interval based on current state.
 * 
 * @param config - Polling configuration
 * @param lagLedgers - Current lag in ledgers
 * @param backoffLevel - Current backoff level (0 = no backoff)
 * @returns Next poll interval in milliseconds
 */
export function calculateNextInterval(
  config: PollingConfig,
  lagLedgers: number,
  backoffLevel: number,
): number {
  // Start with base interval
  let interval = config.minIntervalMs;

  // If lagged, increase interval up to max
  if (lagLedgers > config.lagThresholdLedgers) {
    const lagRatio = Math.min(
      lagLedgers / config.lagThresholdLedgers,
      config.maxIntervalMs / config.minIntervalMs,
    );
    interval = Math.min(
      config.minIntervalMs * lagRatio,
      config.maxIntervalMs,
    );
  }

  // Apply backoff if needed
  if (backoffLevel > 0) {
    const backoffDelay = Math.min(
      config.initialBackoffMs * Math.pow(2, backoffLevel - 1),
      config.maxBackoffMs,
    );
    interval = Math.max(interval, backoffDelay);
  }

  return Math.round(interval);
}

/**
 * Determine if an error is a rate limit error.
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("429") || error.message.includes("rate limit");
  }
  return String(error).includes("429") || String(error).includes("rate limit");
}

/**
 * Determine if an error is transient (should trigger backoff and retry).
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("temporarily unavailable") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("504")
    );
  }
  return false;
}
