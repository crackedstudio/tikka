import { ExecutionContext, CallHandler } from "@nestjs/common";
import { of } from "rxjs";
import {
  CacheHeadersInterceptor,
  CACHE_MAX_AGE_KEY,
} from "./cache-headers.interceptor";

function createMockContext(overrides: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
} = {}) {
  const headers: Record<string, string> = overrides.headers ?? {};
  const method = overrides.method ?? "GET";
  const url = overrides.url ?? "/raffles";

  const request = {
    method,
    originalUrl: url,
    url,
    headers,
  };

  const headerStore: Record<string, string> = {};
  let statusCode = 200;
  let ended = false;
  const response = {
    raw: {
      setHeader: (k: string, v: string) => {
        headerStore[k] = v;
      },
      writeHead: (code: number, _headers?: Record<string, string>) => {
        statusCode = code;
        if (_headers) {
          Object.assign(headerStore, _headers);
        }
      },
      end: () => {
        ended = true;
      },
    },
    header: (_k: string, _v: string) => {},
  };

  const ctx = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => () => {},
  } as unknown as ExecutionContext;

  return { ctx, headerStore, getStatusCode: () => statusCode, isEnded: () => ended };
}

function createMockCallHandler(body: unknown = { raffles: [] }): CallHandler {
  return { handle: () => of(body) };
}

describe("CacheHeadersInterceptor", () => {
  const interceptor = new CacheHeadersInterceptor();

  it("sets Cache-Control and ETag headers on GET responses", (done) => {
    const { ctx, headerStore } = createMockContext({ method: "GET", url: "/raffles" });
    const handler = createMockCallHandler({ raffles: [{ id: 1 }] });

    interceptor.intercept(ctx, handler).subscribe({
      next: (value) => {
        expect(value).toEqual({ raffles: [{ id: 1 }] });
        expect(headerStore["Cache-Control"]).toBe(
          "public, max-age=10, stale-while-revalidate=30",
        );
        expect(headerStore["ETag"]).toBeDefined();
        expect(headerStore["ETag"]).toMatch(/^"[a-f0-9]{16}"$/);
        done();
      },
    });
  });

  it("reads maxAge from method metadata (default 10)", (done) => {
    const handler = () => {};
    Reflect.defineMetadata(CACHE_MAX_AGE_KEY, 30, handler);
    const { ctx, headerStore } = createMockContext({
      method: "GET",
      url: "/raffles/42",
    });
    const overrideCtx = {
      ...ctx,
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    interceptor.intercept(overrideCtx, createMockCallHandler({ id: 42 })).subscribe({
      next: () => {
        expect(headerStore["Cache-Control"]).toBe(
          "public, max-age=30, stale-while-revalidate=90",
        );
        done();
      },
    });
  });

  it("returns 304 when If-None-Match matches the stored ETag", (done) => {
    const body = { raffles: [{ id: 1 }] };
    const handler = () => {};

    // First request — stores the ETag
    const firstCtx = createMockContext({ method: "GET", url: "/raffles?status=open" });
    interceptor
      .intercept(firstCtx.ctx, createMockCallHandler(body))
      .subscribe({
        next: () => {
          const etag = firstCtx.headerStore["ETag"];
          expect(etag).toBeDefined();

          // Second request — matching If-None-Match
          const secondCtx = createMockContext({
            method: "GET",
            url: "/raffles?status=open",
            headers: { "if-none-match": etag },
          });
          const { headerStore, getStatusCode, isEnded } = secondCtx;

          interceptor
            .intercept(secondCtx.ctx, createMockCallHandler(body))
            .subscribe({
              next: () => {
                // For 304, we returned EMPTY so next should not fire
                done(new Error("Expected no next emission for 304"));
              },
              complete: () => {
                expect(getStatusCode()).toBe(304);
                expect(headerStore["ETag"]).toBe(etag);
                expect(isEnded()).toBe(true);
                done();
              },
            });
        },
      });
  });

  it("returns full response when If-None-Match does not match", (done) => {
    const body = { raffles: [{ id: 2 }] };
    const { ctx, headerStore } = createMockContext({
      method: "GET",
      url: "/raffles/2",
      headers: { "if-none-match": '"stale-etag-value"' },
    });

    interceptor.intercept(ctx, createMockCallHandler(body)).subscribe({
      next: (value) => {
        expect(value).toEqual(body);
        expect(headerStore["ETag"]).toBeDefined();
        expect(headerStore["ETag"]).not.toBe('"stale-etag-value"');
        done();
      },
    });
  });

  it("skips caching for non-GET requests", (done) => {
    const { ctx, headerStore } = createMockContext({ method: "POST", url: "/raffles" });
    const handler = createMockCallHandler({ created: true });

    interceptor.intercept(ctx, handler).subscribe({
      next: (value) => {
        expect(value).toEqual({ created: true });
        expect(headerStore["ETag"]).toBeUndefined();
        expect(headerStore["Cache-Control"]).toBeUndefined();
        done();
      },
    });
  });
});
