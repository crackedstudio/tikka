import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

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

    next();
  }
}
