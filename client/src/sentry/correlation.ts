/**
 * correlation.ts — request/correlation id bookkeeping for client telemetry.
 *
 * The backend already returns a correlation id on every response:
 *  - `x-request-id` response header (set by `RequestIdMiddleware`)
 *  - `requestId` in the error body (set by `ErrorResponseInterceptor`)
 *
 * `apiClient` records both here, and `captureClientError` tags the most recent
 * one as `request_id` on the Sentry event so a client error can be joined to
 * the server trace (and to the backend's own Sentry events, which carry the
 * same `request_id` tag).
 *
 * There is no AsyncLocalStorage in the browser, so instead of a single id we
 * keep a small, bounded, most-recent-first list of ids seen by this tab. That
 * gives a useful correlation window for concurrent requests without unbounded
 * memory growth.
 */

/** Response header the backend sets on every request. */
export const CORRELATION_ID_HEADER = 'x-request-id';

/** Upper bound on remembered ids. */
export const MAX_RECENT_CORRELATION_IDS = 5;

/** Longest correlation id accepted (uuids are 36 chars; anything huge is garbage). */
export const MAX_CORRELATION_ID_LENGTH = 128;

let recentCorrelationIds: string[] = [];

/** Normalize a raw value into a safe correlation id, or null if unusable. */
export function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CORRELATION_ID_LENGTH) {
    return null;
  }

  return trimmed;
}

/**
 * Remember a correlation id as the most recent one.
 * Returns the accepted id, or null when the input was unusable.
 */
export function setCorrelationId(value: unknown): string | null {
  const sanitized = sanitizeCorrelationId(value);
  if (!sanitized) {
    return null;
  }

  recentCorrelationIds = [
    sanitized,
    ...recentCorrelationIds.filter((existing) => existing !== sanitized),
  ].slice(0, MAX_RECENT_CORRELATION_IDS);

  return sanitized;
}

/** The most recently seen correlation id, or null. */
export function getCorrelationId(): string | null {
  return recentCorrelationIds[0] ?? null;
}

/** Most-recent-first window of correlation ids seen by this tab. */
export function getRecentCorrelationIds(): readonly string[] {
  return recentCorrelationIds;
}

/** Forget every remembered correlation id (tests, and sign-out). */
export function clearCorrelationIds(): void {
  recentCorrelationIds = [];
}

/** Read a header from either a `Headers` instance or a plain object. */
function readHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  const maybeHeaders = headers as { get?: (key: string) => string | null };
  if (typeof maybeHeaders.get === 'function') {
    return maybeHeaders.get(name);
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : null;
    }
    return typeof value === 'string' ? value : null;
  }

  return null;
}

/** Read `requestId` out of a parsed JSON error body. */
function readBodyRequestId(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = (body as Record<string, unknown>).requestId;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Extract and remember the correlation id from a response.
 * Prefers the `x-request-id` header and falls back to `requestId` in the body.
 * Returns the accepted id, or null when the response carried none.
 */
export function extractCorrelationId(headers: unknown, body?: unknown): string | null {
  return setCorrelationId(readHeader(headers, CORRELATION_ID_HEADER) ?? readBodyRequestId(body));
}

/**
 * Convenience wrapper for a fetch `Response`: remembers its correlation id.
 */
export function rememberResponseCorrelationId(response: {
  headers?: { get(name: string): string | null } | null;
}): string | null {
  return setCorrelationId(response.headers?.get(CORRELATION_ID_HEADER) ?? null);
}
