import { getCurrentRequestId, REQUEST_ID_HEADER } from './request-id.middleware';

export function withRequestIdHeaders(init?: RequestInit): RequestInit {
  const requestId = getCurrentRequestId();
  const headers = new Headers(init?.headers);

  if (requestId) {
    headers.set(REQUEST_ID_HEADER, requestId);
  }

  return {
    ...init,
    headers,
  };
}

export function applyRequestIdToHeaders(headers?: HeadersInit): Headers {
  const requestHeaders = new Headers(headers ?? {});
  const requestId = getCurrentRequestId();

  if (requestId) {
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
  }

  return requestHeaders;
}

const globalWithPatch = globalThis as typeof globalThis & {
  __requestIdFetchPatched?: boolean;
};

if (!globalWithPatch.__requestIdFetchPatched) {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    originalFetch(input, withRequestIdHeaders(init))) as typeof fetch;

  globalWithPatch.__requestIdFetchPatched = true;
}
