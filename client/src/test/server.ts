/**
 * MSW server lifecycle for Vitest unit specs.
 *
 * Started once in src/setupTests.ts via `server.listen()`, reset after every
 * test so each spec starts from the shared default handlers, and closed when
 * the suite finishes. Specs override behaviour with `server.use(...)` without
 * ever stubbing `global.fetch` directly.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

export function startServer(): void {
  server.listen({ onUnhandledRequest: 'bypass' });
}

export function stopServer(): void {
  server.close();
}

export function resetHandlers(): void {
  server.resetHandlers();
}
