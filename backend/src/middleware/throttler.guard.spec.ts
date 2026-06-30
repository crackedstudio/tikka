import { ExecutionContext } from "@nestjs/common";
import { TikkaThrottlerGuard } from "./throttler.guard";

describe("TikkaThrottlerGuard", () => {
  const guard = Object.create(TikkaThrottlerGuard.prototype) as TikkaThrottlerGuard;

  function createHttpContext(input: {
    method: string;
    url: string;
    user?: { address?: string };
  }): ExecutionContext {
    return {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => ({
          method: input.method,
          url: input.url,
          originalUrl: input.url,
          user: input.user,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it("uses authenticated wallet address for POST raffle routes", async () => {
    const tracker = await (guard as any).getTracker(
      {
        headers: { "x-forwarded-for": "9.9.9.9" },
        ip: "1.1.1.1",
      } as unknown as Parameters<TikkaThrottlerGuard["getTracker"]>[0],
      createHttpContext({
        method: "POST",
        url: "/raffles/12/metadata",
        user: { address: "GABC123" },
      }),
    );

    expect(tracker).toBe("GABC123");
  });

  it("uses x-forwarded-for client IP for non-raffle routes", async () => {
    const tracker = await (guard as any).getTracker(
      {
        headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
        ip: "1.1.1.1",
      } as unknown as Parameters<TikkaThrottlerGuard["getTracker"]>[0],
      createHttpContext({
        method: "GET",
        url: "/health",
        user: { address: "GABC123" },
      }),
    );

    expect(tracker).toBe("9.9.9.9");
  });

  it("falls back to request IP when x-forwarded-for is absent", async () => {
    const tracker = await (guard as any).getTracker(
      {
        headers: {},
        ip: "1.1.1.1",
      } as unknown as Parameters<TikkaThrottlerGuard["getTracker"]>[0],
      createHttpContext({
        method: "GET",
        url: "/auth/nonce",
      }),
    );

    expect(tracker).toBe("1.1.1.1");
  });

  it("throws 429 with Retry-After header when limit is exceeded", async () => {
    const detail = {
      ttl: 60000,
      limit: 10,
      key: "nonce",
      tracker: "9.9.9.9",
      totalHits: 11,
      timeToExpire: 42,
      isBlocked: true,
      timeToBlockExpire: 42,
    };
    const context = createHttpContext({ method: "GET", url: "/auth/nonce" });
    const header = jest.fn();
    const guardWithResponse = Object.assign(
      Object.create(TikkaThrottlerGuard.prototype),
      {
        getRequestResponse: () => ({
          req: {},
          res: { header },
        }),
      },
    ) as TikkaThrottlerGuard;

    try {
      await (guardWithResponse as any).throwThrottlingException(context, detail);
      fail("expected throwThrottlingException to throw");
    } catch (error) {
      expect(error).toMatchObject({
        status: 429,
        response: {
          statusCode: 429,
          retryAfter: 42,
        },
      });
    }

    expect(header).toHaveBeenCalledWith("Retry-After", 42);
  });
});
