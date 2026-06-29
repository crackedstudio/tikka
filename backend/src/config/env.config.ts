/**
 * Environment configuration for tikka-backend.
 * Using getters ensures environment variables are read at runtime,
 * avoiding issues where they might be cached before values are loaded.
 *
 * Stellar network fields align with Nest `ConfigService` after `env.schema` validation.
 * Prefer `ConfigService` in injectable services for INDEXER_URL / timeouts;
 * use this module for `stellar` resolution and non-DI contexts.
 */
import {
  resolveIndexerBaseUrl,
  resolveStellarContractId,
  resolveStellarHorizonUrl,
  resolveStellarNetworkId,
  resolveStellarNetworkPassphrase,
} from './stellar.constants';

function envLikeFromProcess(): Record<string, string | undefined> {
  return { ...process.env };
}

export const env = {
  get supabase() {
    return {
      url: process.env.SUPABASE_URL ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    };
  },
  get indexer() {
    const envLike = envLikeFromProcess();
    return {
      url: resolveIndexerBaseUrl(envLike),
      timeoutMs: parseInt(process.env.INDEXER_TIMEOUT_MS ?? '5000', 10),
    };
  },
  get stellar() {
    const envLike = envLikeFromProcess();
    const network = resolveStellarNetworkId(envLike);
    return {
      network,
      horizonUrl: resolveStellarHorizonUrl(envLike),
      networkPassphrase: resolveStellarNetworkPassphrase(envLike),
      contractId: resolveStellarContractId(envLike),
    };
  },
  get auth() {
    return {
      jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
      siwsDomain: process.env.SIWS_DOMAIN ?? 'tikka.io',
      siwsNonceTtlSeconds: parseInt(process.env.SIWS_NONCE_TTL_SECONDS ?? '300', 10),
      adminToken: process.env.ADMIN_TOKEN ?? '',
      adminIpAllowlist: process.env.ADMIN_IP_ALLOWLIST ?? '',
    };
  },
  get redis() {
    return {
      url: process.env.REDIS_URL ?? '',
      metadataCacheTtlSeconds: parseInt(process.env.METADATA_CACHE_TTL_SECONDS ?? '3600', 10),
    };
  },
  get storage() {
    return {
      pinataJwt: process.env.PINATA_JWT ?? undefined,
      pinataApiKey: process.env.PINATA_API_KEY ?? undefined,
      pinataApiSecret: process.env.PINATA_API_SECRET ?? undefined,
      enableIpfsPinning: process.env.ENABLE_IPFS_PINNING === 'true',
      ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL ?? 'https://ipfs.io/ipfs/',
    };
  },
  get logging() {
    return {
      redactFields: process.env.LOG_REDACT_FIELDS ?? undefined,
    };
  },
  get notifications() {
    return {
      fcmEnabled: process.env.FCM_ENABLED === 'true',
      fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? undefined,
      fcmServiceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH ?? undefined,
    };
  },
  get rateLimits() {
    return {
      throttleDefaultLimit: parseInt(process.env.THROTTLE_DEFAULT_LIMIT ?? '100', 10),
      throttleDefaultTtl: parseInt(process.env.THROTTLE_DEFAULT_TTL ?? '60', 10),
      throttleAuthLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '10', 10),
      throttleAuthTtl: parseInt(process.env.THROTTLE_AUTH_TTL ?? '60', 10),
      throttleNonceLimit: parseInt(process.env.THROTTLE_NONCE_LIMIT ?? '30', 10),
      throttleNonceTtl: parseInt(process.env.THROTTLE_NONCE_TTL ?? '60', 10),
      raffleCreateLimit: parseInt(process.env.RAFFLE_CREATE_RATE_LIMIT ?? '5', 10),
      raffleCreateWindowSeconds: parseInt(process.env.RAFFLE_CREATE_RATE_WINDOW_SECONDS ?? '600', 10),
    };
  },
  get geo() {
    const blockedCountriesStr = process.env.GEO_BLOCK_COUNTRIES ?? '';
    const blockedCountries = this.parseBlockedCountries(blockedCountriesStr);
    return {
      providerUrl: process.env.GEO_PROVIDER_URL ?? 'http://ip-api.com/json',
      timeoutMs: parseInt(process.env.GEO_TIMEOUT_MS ?? '3000', 10),
      blockedCountries: blockedCountries,
    };
  },
  get server() {
    return {
      port: parseInt(process.env.PORT ?? '3001', 10),
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
      frontendUrl: process.env.VITE_FRONTEND_URL ?? '',
      nodeEnv: process.env.NODE_ENV ?? 'development',
      swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
    };
  },
  get sentry() {
    return {
      dsn: process.env.SENTRY_DSN ?? undefined,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    };
  },
  get backfill() {
    return {
      maxRange: parseInt(process.env.BACKFILL_MAX_RANGE ?? '10000', 10),
      retryCount: parseInt(process.env.BACKFILL_RETRY_COUNT ?? '3', 10),
      retryDelayMs: parseInt(process.env.BACKFILL_RETRY_DELAY_MS ?? '1000', 10),
      horizonTimeoutMs: parseInt(process.env.BACKFILL_HORIZON_TIMEOUT_MS ?? '10000', 10),
    };
  },

  // Private helper for parsing blocked countries
  private parseBlockedCountries(str: string): string[] {
    if (!str || str.trim() === '') {
      return [];
    }
    if (str.trim() === '*') {
      return []; // Wildcard means allow all
    }
    return str
      .split(',')
      .map(code => code.trim().toUpperCase())
      .filter(code => code.length === 2 && /^[A-Z]{2}$/.test(code));
  },

  // -------------------------------------------------------------------------
  // Backward-compatible aliases — prefer the unified modules above.
  // These delegate to the canonical getters so that existing consumers
  // (auth.module, siws.service, push-notification.service, geo-blocking
  // middleware) continue to work without a rename pass.
  // -------------------------------------------------------------------------

  /** @deprecated Use `env.auth.jwtSecret`, `env.auth.jwtExpiresIn` instead. */
  get jwt() {
    return {
      secret: this.auth.jwtSecret,
      expiresIn: this.auth.jwtExpiresIn,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    };
  },
  /** @deprecated Use `env.auth.siwsDomain`, `env.auth.siwsNonceTtlSeconds` instead. */
  get siws() {
    return {
      domain: this.auth.siwsDomain,
      nonceTtlSeconds: this.auth.siwsNonceTtlSeconds,
    };
  },
  /** @deprecated Use `env.notifications` instead. */
  get fcm() {
    return {
      enabled: this.notifications.fcmEnabled,
      serviceAccountJson: this.notifications.fcmServiceAccountJson,
      serviceAccountPath: this.notifications.fcmServiceAccountPath,
    };
  },
  /** @deprecated Use `env.geo.blockedCountries` instead. */
  get blockedCountries() {
    return this.geo.blockedCountries.join(',');
  },
} as const;
