import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { GeoService } from '../services/geo.service';

/**
 * GeoMiddleware — resolves the client's country from their IP address
 * and attaches it as the `x-country-code` request header.
 *
 * This middleware performs geo-location only (country detection) and does NOT
 * block requests. For geo-blocking functionality, use GeoBlockingMiddleware.
 *
 * Expected headers for country detection:
 *   - CF-IPCountry: Country code from Cloudflare (checked first)
 *   - X-Country-Code: Fallback country code header
 *   - If neither header is present, resolves country from client IP using GeoService
 *
 * Downstream handlers (guards, services) can read:
 *   request.headers['x-country-code']  →  e.g. "US", "NG", "GB", or "" for unknown
 *
 * The header is set to an empty string when geo lookup fails or the IP
 * is private, so consumers must always handle the empty-string case.
 *
 * Environment configuration:
 *   - GEO_PROVIDER_URL: URL for IP geolocation service (defaults to ip-api.com)
 *   - GEO_TIMEOUT_MS: Timeout for geolocation requests (defaults to 3000ms)
 *
 * Registration: applied globally in AppModule via configure(consumer).
 * Should be applied BEFORE GeoBlockingMiddleware if both are used.
 */
@Injectable()
export class GeoMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeoMiddleware.name);

  constructor(private readonly geoService: GeoService) {}

  /**
   * NestJS with the Fastify adapter passes the full FastifyRequest object
   * (not the raw IncomingMessage) as `req` in middleware.
   * We cast accordingly so we can mutate `req.headers` directly.
   */
  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    try {
      const ip = this.extractIp(req);
      const geo = await this.geoService.lookupIp(ip);
      const countryCode = geo?.countryCode ?? '';

      // Fastify exposes headers as a plain object on the request.
      // Mutating it here makes the value available to all downstream
      // guards and handlers via request.headers['x-country-code'].
      (req.headers as Record<string, string>)['x-country-code'] = countryCode;

      if (countryCode) {
        this.logger.debug(`IP ${ip} resolved to country: ${countryCode}`);
      }
    } catch (err) {
      // Never block the request due to a geo error
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`GeoMiddleware error: ${message}`);
    }

    next();
  }

  /**
   * Extract the real client IP, respecting x-forwarded-for set by proxies
   * (Railway, Fly.io, Nginx, etc.).
   */
  private extractIp(req: FastifyRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }

    // Fastify exposes the parsed IP directly
    return req.ip ?? req.raw.socket?.remoteAddress ?? 'unknown';
  }
}
