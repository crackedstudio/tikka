import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerRequest } from "@nestjs/throttler";
import { FastifyRequest } from "fastify";

/**
 * Custom ThrottlerGuard for the Fastify adapter.
 *
 * Overrides `getTracker()` to extract the real client IP from:
 *   1. `x-forwarded-for` header (set by Railway / Fly.io / reverse proxies)
 *   2. The raw Fastify request IP as fallback
 *
 * This prevents a single IP from bypassing limits by sitting behind a proxy.
 */
@Injectable()
export class TikkaThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: ThrottlerRequest): Promise<string> {
    const fastifyReq = req as unknown as FastifyRequest;

    const forwarded = fastifyReq.headers["x-forwarded-for"];
    if (forwarded) {
      // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
      const firstIp = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(",")[0];
      return firstIp.trim();
    }

    return fastifyReq.ip ?? "unknown";
  }

  /**
   * Return a helpful 429 response body that includes Retry-After seconds.
   * NestJS Throttler sets the Retry-After header automatically; we just
   * override the error message for clarity.
   */
  protected throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: {
      ttl: number;
      limit: number;
      key: string;
      tracker: string;
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
    },
  ): Promise<void> {
    throw Object.assign(
      new (require("@nestjs/common").HttpException)(
        {
          statusCode: 429,
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please slow down and try again.",
          retryAfter: Math.ceil(_throttlerLimitDetail.timeToExpire / 1000),
        },
        429,
        {
          cause: undefined,
          description: "Too Many Requests",
        },
      ),
    );
  }
}
