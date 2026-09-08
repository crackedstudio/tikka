import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithHeaders, res: ResponseWithHeaders, next: () => void): void {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();

    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // Bind the id to the async context so downstream services (e.g. IndexerService,
    // which forwards it as an `x-request-id` header) and log lines can recover it.
    runWithRequestContext(requestId, () => next());
  }
}
