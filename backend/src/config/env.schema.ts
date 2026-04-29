import { z } from 'zod';
import {
  resolveIndexerBaseUrl,
  resolveStellarNetworkId,
} from './stellar.constants';

function toEnvLike(config: Record<string, unknown>): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...process.env };
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined || v === null) continue;
    merged[k] = String(v);
  }
  return merged;
}

/**
 * Normalize STELLAR_NETWORK and fill INDEXER_URL when omitted so it matches
 * the active Stellar network (see stellar.constants).
 */
function preprocessStellarEnv(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const c = { ...input };
  const envLike = toEnvLike(c);
  const network = resolveStellarNetworkId(envLike);
  c.STELLAR_NETWORK = network;

  const idx = c.INDEXER_URL;
  if (idx === undefined || idx === null || String(idx).trim() === '') {
    c.INDEXER_URL = resolveIndexerBaseUrl({
      ...envLike,
      STELLAR_NETWORK: network,
      INDEXER_URL: undefined,
    });
  }

  const hz = c.STELLAR_HORIZON_URL;
  if (hz === '' || hz === null) delete c.STELLAR_HORIZON_URL;
  const cid = c.STELLAR_CONTRACT_ID;
  if (cid === '' || cid === null) delete c.STELLAR_CONTRACT_ID;

  return c;
}

/**
 * Zod schema for process.env validation.
 *
 * Required vars (no defaults) will cause the app to fail at startup
 * with a clear error if missing. Optional vars have sensible defaults.
 *
 * `.passthrough()` allows system env vars (PATH, HOME, NODE_ENV, etc.)
 * through without failing validation — ConfigModule passes the entire
 * process.env object to the validate function.
 */
const envSchemaInner = z
  .object({
    // Server
    PORT: z.coerce.number().int().positive().default(3001),
    MAINTENANCE_MODE: z.coerce.boolean().default(false),

    // Supabase — required for metadata and storage
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // Stellar — network drives Horizon / contract defaults unless overridden
    STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
    STELLAR_HORIZON_URL: z.string().url().optional(),
    STELLAR_CONTRACT_ID: z.string().min(1).optional(),

    // Indexer (INDEXER_URL filled in preprocess when empty)
    INDEXER_URL: z.string().url(),
    INDEXER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    // Backfill service
    BACKFILL_MAX_RANGE: z.coerce.number().int().positive().default(10000),
    BACKFILL_RETRY_COUNT: z.coerce.number().int().positive().default(3),
    BACKFILL_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
    BACKFILL_HORIZON_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // SIWS
    SIWS_DOMAIN: z.string().default('tikka.io'),

    // Frontend
    VITE_FRONTEND_URL: z.string().url(),

    // Admin dashboard
    ADMIN_TOKEN: z.string().min(1),
    ADMIN_IP_ALLOWLIST: z.string().default(''),

    // Push notifications (FCM)
    FCM_ENABLED: z.coerce.boolean().default(false),
    FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
    FCM_SERVICE_ACCOUNT_PATH: z.string().optional(),

    // Geolocation
    GEO_PROVIDER_URL: z.string().url().default('http://ip-api.com/json'),
    GEO_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    BLOCKED_COUNTRIES: z.string().default(''),

    // Sentry — optional; when absent the SDK is not initialized
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

    // Throttle — all optional with sensible defaults
    THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),
    THROTTLE_DEFAULT_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
    THROTTLE_AUTH_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_NONCE_LIMIT: z.coerce.number().int().positive().default(30),
    THROTTLE_NONCE_TTL: z.coerce.number().int().positive().default(60),
    RAFFLE_CREATE_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    RAFFLE_CREATE_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(600),
  })
  .passthrough();

export const envSchema = z.preprocess(preprocessStellarEnv, envSchemaInner);

export type EnvConfig = z.infer<typeof envSchemaInner>;

/**
 * Validate function for `ConfigModule.forRoot({ validate })`.
 *
 * Called by NestJS during bootstrap after `.env` files are loaded.
 * Parses the merged env vars through the Zod schema and throws
 * with a formatted error listing all invalid fields on failure.
 */
export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed:\n${formatted}\n\nCheck .env.example for required variables.`,
    );
  }
  return result.data;
}
