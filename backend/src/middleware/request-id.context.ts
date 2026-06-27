import { AsyncLocalStorage } from 'async_hooks';

export const requestIdStorage = new AsyncLocalStorage<string>();

export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}
