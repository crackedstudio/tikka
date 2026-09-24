import { AsyncLocalStorage } from 'async_hooks';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestContextStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Bind `requestId` to the async context for the duration of `fn`. The indexer
 * reads the backend's `x-request-id` (or generates its own) on every inbound
 * HTTP request so log lines carry the same correlation id as the caller.
 */
export function runRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Returns the current request id, or `undefined` outside a request scope. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Headers carrying the current request id, or empty when none is active. */
export function getRequestIdHeaders(): Record<string, string> {
  const requestId = getRequestId();
  return requestId ? { [REQUEST_ID_HEADER]: requestId } : {};
}
