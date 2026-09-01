import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server, startServer, stopServer, resetHandlers } from './test/server';

// jsdom does not implement window.matchMedia — provide a minimal stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Start the shared MSW server for every unit spec. Per-spec behaviour is layered
// on top with `server.use(...)`; the server is reset between tests so no spec
// leaks handlers into another.
beforeAll(() => {
  startServer();

  // jsdom replaces the global AbortController/AbortSignal with its own
  // implementation, which is incompatible with the undici-backed fetch that MSW's
  // interceptor uses. The signal is only used by apiClient for timeouts/aborts,
  // which the unit tests do not exercise, so we strip it before the request
  // reaches the interceptor to keep interception working.
  const patchedFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init && init.signal) {
      const { signal: _signal, ...rest } = init;
      return patchedFetch(input, rest as RequestInit);
    }
    return patchedFetch(input, init);
  }) as typeof fetch;
});

afterEach(() => resetHandlers());
afterAll(() => stopServer());
