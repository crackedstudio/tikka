import { AsyncLocalStorage } from 'async_hooks';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestContextStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Run `fn` with the given request id bound to the async context so that any
 * downstream work (HTTP calls into the indexer/oracle, log lines, Sentry tags)
 * can recover the same correlation id via {@link getRequestId}.
 */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/**
 * Returns the current request id, or `undefined` when not inside a request
 * scope (e.g. background jobs, scheduled tasks).
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Returns a headers object carrying the current request id, or an empty object
 * when no request scope is active. Spread into outgoing `fetch`/`RequestInit`
 * headers to propagate the trace across service boundaries.
 */
export function getRequestIdHeaders(): Record<string, string> {
  const requestId = getRequestId();
  return requestId ? { 'x-request-id': requestId } : {};
}
