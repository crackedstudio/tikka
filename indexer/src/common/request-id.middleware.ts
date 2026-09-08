import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { REQUEST_ID_HEADER, runRequestContext } from "./request-context";

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

/**
 * Ensures every inbound request has a correlation id:
 *  - reuses the caller's `x-request-id` (e.g. forwarded by the backend), or
 *  - generates one so indexer logs always carry a traceable id.
 * The id is bound to the async context via {@link runRequestContext} and echoed
 * back on the response for client-side correlation.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: RequestWithHeaders,
    res: ResponseWithHeaders,
    next: () => void,
  ): void {
    const incoming = req.headers?.[REQUEST_ID_HEADER];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

    if (req.headers) req.headers[REQUEST_ID_HEADER] = requestId;
    if (res?.setHeader) res.setHeader(REQUEST_ID_HEADER, requestId);

    runRequestContext(requestId, () => next());
  }
}
