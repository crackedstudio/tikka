import { WebhookDlqReason } from "../database/entities/webhook-dead-letter.entity";

/**
 * Delivery retry policy for outbound webhooks.
 *
 * Kept as pure functions with no fetch, no clock, and no repositories so the
 * decisions — is this worth retrying, how long do we wait, which dead-letter
 * reason does this failure deserve — can be asserted directly instead of being
 * inferred from a mocked HTTP call.
 */

/** Attempts per delivery, including the first. */
export const MAX_DELIVERY_ATTEMPTS = 3;

/** Per-attempt timeout. */
export const DELIVERY_TIMEOUT_MS = 5_000;

/** Base for the exponential backoff, in milliseconds. */
export const BACKOFF_BASE_MS = 1_000;

/**
 * 4xx statuses that are still worth retrying.
 *
 * `408 Request Timeout` and `429 Too Many Requests` are transient by
 * definition — the same request can succeed later. Every other 4xx means the
 * request itself is wrong (bad URL, bad payload, unauthorized), and retrying it
 * only delays the dead-letter record and burns the subscriber's rate limit.
 */
const RETRYABLE_4XX_STATUSES = new Set([408, 429]);

/**
 * Whether a response status justifies another attempt.
 *
 * 5xx is the server's fault and may clear; other 4xx is ours and will not.
 */
export function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true;
  if (status >= 400) return RETRYABLE_4XX_STATUSES.has(status);
  return false;
}

/**
 * Delay before the attempt *following* `attempt` (1-based).
 *
 * Matches the delays the service has always used: 2s, then 4s.
 */
export function backoffDelayMs(
  attempt: number,
  baseMs: number = BACKOFF_BASE_MS,
): number {
  return Math.pow(2, attempt) * baseMs;
}

export interface DeliveryFailure {
  /** Human-readable summary, safe to store and log. */
  message: string;
  /** Response status, when the failure was an HTTP response. */
  status?: number;
  reason: WebhookDlqReason;
  /** Whether another attempt (or a later DLQ replay) could succeed. */
  retryable: boolean;
}

/**
 * Map a failure onto a dead-letter reason and a retryability verdict.
 *
 * Order matters. Connection errors are matched before the generic `abort`
 * token, because `ECONNABORTED` mentions "abort" but is a connection failure,
 * not a timeout — while `AbortSignal.timeout()`'s own `TimeoutError` does
 * mention "timeout" and is. Previously `ECONNABORTED` was reported as
 * `TIMEOUT`, which sent operators looking at the wrong end of the connection.
 */
export function classifyFailureMessage(message: string): WebhookDlqReason {
  const lower = message.toLowerCase();

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("eai_again") ||
    lower.includes("unreachable")
  ) {
    return WebhookDlqReason.UNREACHABLE;
  }

  if (lower.includes("timeout")) {
    return WebhookDlqReason.TIMEOUT;
  }

  if (
    lower.includes("econnreset") ||
    lower.includes("econnaborted") ||
    lower.includes("network")
  ) {
    return WebhookDlqReason.NETWORK_ERROR;
  }

  // Our own `AbortSignal.timeout()` abort, or a bare DOMException from one.
  if (lower.includes("abort")) {
    return WebhookDlqReason.TIMEOUT;
  }

  return WebhookDlqReason.HTTP_ERROR;
}

/**
 * Classify a failed delivery attempt.
 *
 * Pass `status`/`statusText` for an HTTP response, or `error` for a thrown
 * one. Transport failures are retryable; HTTP failures follow
 * `isRetryableStatus`.
 */
export function classifyDeliveryFailure(input: {
  error?: unknown;
  status?: number;
  statusText?: string;
}): DeliveryFailure {
  const { error, status, statusText } = input;

  if (typeof status === "number") {
    const message = `HTTP Error: ${status}${statusText ? ` ${statusText}` : ""}`;
    return {
      message,
      status,
      reason: classifyFailureMessage(message),
      retryable: isRetryableStatus(status),
    };
  }

  // Duck-typed rather than `instanceof Error`: the rejection from
  // `AbortSignal.timeout()` is a `DOMException`, which is not an `Error`
  // subclass in every runtime — and the whole point of this branch is to
  // classify the timeout it represents.
  const message =
    typeof error === "string" && error.length > 0
      ? error
      : error != null &&
          typeof (error as { message?: unknown }).message === "string" &&
          (error as { message: string }).message.length > 0
        ? (error as { message: string }).message
        : "Network Error";

  return {
    message,
    reason: classifyFailureMessage(message),
    retryable: true,
  };
}
