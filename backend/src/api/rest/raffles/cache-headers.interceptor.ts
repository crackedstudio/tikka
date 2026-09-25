import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, EMPTY } from "rxjs";
import { map } from "rxjs/operators";
import { createHash } from "crypto";
import { FastifyReply, FastifyRequest } from "fastify";

export const CACHE_MAX_AGE_KEY = "cache-max-age";

/**
 * Compute a short ETag from a JSON-serialisable body.
 */
function computeETag(body: unknown): string {
  const raw = JSON.stringify(body);
  const hash = createHash("sha1").update(raw).digest("hex");
  return `"${hash.slice(0, 16)}"`;
}

interface ETagEntry {
  etag: string;
  expiresAt: number;
}

/**
 * Lightweight in-process ETag store keyed by route + query string.
 * Entries expire after `maxAge * 3` so stale entries are reclaimed.
 */
const etagStore = new Map<string, ETagEntry>();
const STORE_SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function storeKey(route: string): string {
  return route;
}

function sweepStore(now: number): void {
  if (now - lastSweep < STORE_SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of etagStore) {
    if (now > entry.expiresAt) etagStore.delete(key);
  }
}

/**
 * NestJS interceptor that adds Cache-Control headers and ETag support to GET
 * responses.
 *
 * Usage:
 * ```ts
 * @UseInterceptors(CacheHeadersInterceptor)
 * @SetMetadata(CACHE_MAX_AGE_KEY, 15)
 * ```
 *
 * TTL is read from the `CACHE_MAX_AGE_KEY` method-level metadata.  If absent,
 * defaults to 10 seconds.
 *
 * Clients sending `If-None-Match` that matches the current ETag receive a
 * `304 Not Modified` with no body.
 */
@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const rawRes = response.raw;

    // Only cache GET requests
    if (request.method !== "GET") {
      return next.handle();
    }

    // Read TTL from method metadata; default 10s
    const reflector = context.getHandler();
    const maxAge: number =
      Reflect.getMetadata(CACHE_MAX_AGE_KEY, reflector) ?? 10;

    const route = request.originalUrl ?? request.url ?? "";
    const cacheKey = storeKey(route);
    const now = Date.now();
    sweepStore(now);

    // Check existing ETag
    const ifNoneMatch = request.headers["if-none-match"];
    const existing = etagStore.get(cacheKey);
    if (existing && existing.etag === ifNoneMatch) {
      rawRes.writeHead(304, {
        ETag: existing.etag,
        "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 3}`,
      });
      rawRes.end();
      return EMPTY;
    }

    return next.handle().pipe(
      map((body) => {
        const etag = computeETag(body);
        etagStore.set(cacheKey, {
          etag,
          expiresAt: now + maxAge * 3 * 1000,
        });

        rawRes.setHeader("ETag", etag);
        rawRes.setHeader(
          "Cache-Control",
          `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 3}`,
        );
        return body;
      }),
    );
  }
}
