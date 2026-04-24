/**
 * Environment configuration for tikka-backend.
 * Using getters ensures environment variables are read at runtime,
 * avoiding issues where they might be cached before values are loaded.
 */
export const env = {
  get supabase() {
    return {
      url: process.env.SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    };
  },
  get indexer() {
    return {
      url: process.env.INDEXER_URL ?? "http://localhost:3002",
      timeoutMs: parseInt(process.env.INDEXER_TIMEOUT_MS ?? "5000", 10),
    };
  },
  get jwt() {
    return {
      secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
      expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
    };
  },
  get siws() {
    return {
      domain: process.env.SIWS_DOMAIN ?? "tikka.io",
    };
  },
  get fcm() {
    return {
      enabled: process.env.FCM_ENABLED === 'true',
      serviceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? undefined,
      serviceAccountPath: process.env.FCM_SERVICE_ACCOUNT_PATH ?? undefined,
    };
  },
  get geo() {
    return {
      /**
       * Base URL for the geolocation provider.
       * Default: ip-api.com free tier (HTTP only, 45 req/min).
       * Override with a paid/HTTPS endpoint in production.
       */
      providerUrl: process.env.GEO_PROVIDER_URL ?? 'http://ip-api.com/json',
      timeoutMs: parseInt(process.env.GEO_TIMEOUT_MS ?? '3000', 10),
    };
  },
} as const;
