import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env.config';

/**
 * Response shape from ip-api.com (free tier, no API key required).
 * Docs: https://ip-api.com/docs/api:json
 */
interface IpApiResponse {
  status: 'success' | 'fail';
  countryCode: string;
  country: string;
  message?: string;
}

/**
 * Result returned by GeoService lookups.
 */
export interface GeoLookupResult {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "NG", "GB") */
  countryCode: string;
  /** Full country name */
  country: string;
}

/**
 * GeoService — detects user country via IP using ip-api.com.
 *
 * ip-api.com free tier:
 *   - No API key required
 *   - 45 requests/minute per IP
 *   - HTTPS requires a paid plan; HTTP is used for the free tier
 *
 * For production, set GEO_PROVIDER_URL to a paid/self-hosted endpoint
 * that supports HTTPS (e.g. ip-api.com pro, ipinfo.io, MaxMind GeoIP2).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly providerUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.providerUrl = env.geo.providerUrl;
    this.timeoutMs = env.geo.timeoutMs;
  }

  /**
   * Look up the country for a given IP address.
   *
   * Returns null when:
   *  - The IP is private/loopback (127.x, 10.x, 192.168.x, ::1)
   *  - The provider returns a non-success status
   *  - The request times out or fails
   *
   * @param ip - IPv4 or IPv6 address string
   */
  async lookupIp(ip: string): Promise<GeoLookupResult | null> {
    if (this.isPrivateIp(ip)) {
      this.logger.debug(`Skipping geo lookup for private IP: ${ip}`);
      return null;
    }

    const url = `${this.providerUrl}/${encodeURIComponent(ip)}?fields=status,message,country,countryCode`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        this.logger.warn(`Geo provider returned HTTP ${res.status} for IP ${ip}`);
        return null;
      }

      const data = (await res.json()) as IpApiResponse;

      if (data.status !== 'success') {
        this.logger.warn(`Geo lookup failed for IP ${ip}: ${data.message ?? 'unknown reason'}`);
        return null;
      }

      return { countryCode: data.countryCode, country: data.country };
    } catch (err) {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Geo lookup error for IP ${ip}: ${message}`);
      return null;
    }
  }

  /**
   * Check whether a user is allowed to access a specific raffle based on
   * their detected country and the raffle's geo-restriction list.
   *
   * Signature matches the issue spec: checkAccess(address, raffleId)
   * where `address` is the client IP address (resolved from the request
   * by GeoMiddleware or the caller).
   *
   * @param address       - Client IP address (IPv4 or IPv6)
   * @param raffleId      - Raffle identifier (for logging / future DB lookup)
   * @param blockedCountries - ISO 3166-1 alpha-2 codes that are NOT allowed
   *                          (empty array = no geo restrictions)
   */
  async checkAccess(
    address: string,
    raffleId: number | string,
    blockedCountries: string[] = [],
  ): Promise<{ allowed: boolean; countryCode: string | null; reason?: string }> {
    const ip = address;
    if (blockedCountries.length === 0) {
      return { allowed: true, countryCode: null };
    }

    const geo = await this.lookupIp(ip);

    if (!geo) {
      // Cannot determine location — fail open (allow) to avoid blocking legitimate users
      this.logger.warn(
        `Could not determine country for IP ${ip} on raffle ${raffleId}; allowing access`,
      );
      return { allowed: true, countryCode: null, reason: 'geo_lookup_failed' };
    }

    const blocked = blockedCountries
      .map((c) => c.toUpperCase())
      .includes(geo.countryCode.toUpperCase());

    if (blocked) {
      this.logger.log(
        `Access denied for raffle ${raffleId}: country ${geo.countryCode} is restricted`,
      );
      return {
        allowed: false,
        countryCode: geo.countryCode,
        reason: `country_restricted:${geo.countryCode}`,
      };
    }

    return { allowed: true, countryCode: geo.countryCode };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns true for RFC-1918 private ranges, loopback, and link-local addresses.
   * These IPs cannot be geo-located and should be skipped.
   */
  private isPrivateIp(ip: string): boolean {
    // IPv6 loopback
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;

    // Strip IPv6-mapped IPv4 prefix (::ffff:x.x.x.x)
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return false;

    const [a, b] = parts;
    return (
      a === 127 ||                        // 127.0.0.0/8  loopback
      a === 10 ||                         // 10.0.0.0/8   private
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
      (a === 192 && b === 168) ||          // 192.168.0.0/16 private
      (a === 169 && b === 254)             // 169.254.0.0/16 link-local
    );
  }
}
