import { Injectable, Logger, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { GeoService } from '../services/geo.service';
import { env } from '../config/env.config';

/**
 * GeoBlockingMiddleware — blocks requests from restricted geographic regions
 * based on the BLOCKED_COUNTRIES environment variable.
 *
 * This middleware uses the GeoService.checkAccess method to determine if a request
 * should be allowed or blocked based on the client's IP address and country.
 *
 * Expected headers for country detection:
 *   - CF-IPCountry: Country code from Cloudflare (preferred)
 *   - X-Country-Code: Fallback country code header
 *   - If neither header is present, the middleware will attempt to resolve
 *     the country from the client IP using GeoService
 *
 * Environment configuration:
 *   - BLOCKED_COUNTRIES: Comma-separated list of ISO 3166-1 alpha-2 country codes
 *                        to block (e.g., "US,NG,GB"). Empty string or "*" allows all.
 *   - GEO_PROVIDER_URL: URL for IP geolocation service (defaults to ip-api.com)
 *   - GEO_TIMEOUT_MS: Timeout for geolocation requests (defaults to 3000ms)
 *
 * Local development override:
 *   Set BLOCKED_COUNTRIES="*" to disable all geo-blocking during local development.
 *
 * Registration: Can be applied globally in AppModule or selectively to specific routes.
 */
@Injectable()
export class GeoBlockingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeoBlockingMiddleware.name);
  private readonly blockedCountries: string[];

  constructor(private readonly geoService: GeoService) {
    this.blockedCountries = this.parseBlockedCountries(env.blockedCountries);
  }

  /**
   * Middleware handler that checks if the request should be allowed based on geo-location.
   * 
   * @param req - FastifyRequest object
   * @param res - FastifyReply object  
   * @param next - Next function to call if request is allowed
   * @throws ForbiddenException - If request is from a blocked country
   */
  async use(req: FastifyRequest, res: FastifyReply, next: () => void): Promise<void> {
    // Skip geo-blocking if no countries are blocked or wildcard is set
    if (this.blockedCountries.length === 0) {
      return next();
    }

    try {
      const clientIp = this.extractClientIp(req);
      const countryCode = this.getCountryFromHeaders(req);

      let accessResult;
      
      // If we have a country code from headers, use it directly
      if (countryCode) {
        const isBlocked = this.blockedCountries
          .map(c => c.toUpperCase())
          .includes(countryCode.toUpperCase());
        
        accessResult = {
          allowed: !isBlocked,
          countryCode,
          reason: isBlocked ? `country_restricted:${countryCode}` : undefined
        };
      } else {
        // Otherwise, resolve country from IP using GeoService
        accessResult = await this.geoService.checkAccess(
          clientIp,
          'web-request',
          this.blockedCountries
        );
      }

      if (!accessResult.allowed) {
        this.logger.warn(
          `Access denied for IP ${clientIp}: ${accessResult.reason}`
        );
        throw new ForbiddenException(
          `Access from your location is not permitted. Country: ${accessResult.countryCode || 'Unknown'}`
        );
      }

      if (accessResult.countryCode) {
        this.logger.debug(`Access allowed for IP ${clientIp}, country: ${accessResult.countryCode}`);
      }

    } catch (error) {
      // If it's already a ForbiddenException, re-throw it
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // For other errors (geo lookup failures), log but allow the request
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GeoBlockingMiddleware error: ${message}. Allowing request as fallback.`);
    }

    next();
  }

  /**
   * Extract the real client IP, respecting x-forwarded-for set by proxies
   * (Railway, Fly.io, Nginx, etc.).
   */
  private extractClientIp(req: FastifyRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }

    // Fastify exposes the parsed IP directly
    return req.ip ?? req.raw.socket?.remoteAddress ?? 'unknown';
  }

  /**
   * Get country code from request headers.
   * Checks CF-IPCountry first (Cloudflare), then X-Country-Code as fallback.
   */
  private getCountryFromHeaders(req: FastifyRequest): string | null {
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry && typeof cfCountry === 'string' && cfCountry !== 'XX') {
      return cfCountry;
    }

    const xCountry = req.headers['x-country-code'];
    if (xCountry && typeof xCountry === 'string' && xCountry !== '') {
      return xCountry;
    }

    return null;
  }

  /**
   * Parse BLOCKED_COUNTRIES environment variable into array of country codes.
   * 
   * @param blockedCountriesStr - Comma-separated string of country codes or "*"
   * @returns Array of country codes, empty array if no blocking should be applied
   */
  private parseBlockedCountries(blockedCountriesStr: string): string[] {
    if (!blockedCountriesStr || blockedCountriesStr.trim() === '') {
      return [];
    }

    if (blockedCountriesStr.trim() === '*') {
      return []; // Wildcard means allow all
    }

    return blockedCountriesStr
      .split(',')
      .map(code => code.trim().toUpperCase())
      .filter(code => code.length === 2 && /^[A-Z]{2}$/.test(code));
  }
}
