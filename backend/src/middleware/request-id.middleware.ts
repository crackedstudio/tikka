import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export const requestIdStorage = new AsyncLocalStorage<string>();

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

export function getCurrentRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

export function runWithRequestId<T>(requestId: string, callback: () => T | Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const result = requestIdStorage.run(requestId, callback);
      Promise.resolve(result).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithHeaders, res: ResponseWithHeaders, next: () => void): void {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();

    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    requestIdStorage.run(requestId, () => next());
  }
}
