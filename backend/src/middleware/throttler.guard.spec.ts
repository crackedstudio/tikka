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

  it("falls back to IP tracker for non-raffle routes", async () => {
    const tracker = await (guard as any).getTracker(
      {
        headers: { "x-forwarded-for": "9.9.9.9" },
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
});
