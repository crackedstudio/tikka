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
    };
  },
  get siws() {
    return {
      domain: process.env.SIWS_DOMAIN ?? "tikka.io",
    };
  },
} as const;
