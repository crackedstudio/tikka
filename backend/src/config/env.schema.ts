import { z } from 'zod';

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
export const envSchema = z
  .object({
    // Server
    PORT: z.coerce.number().int().positive().default(3001),

    // Supabase — required for metadata and storage
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // Indexer
    INDEXER_URL: z.string().url().default('http://localhost:3002'),
    INDEXER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

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

    // Throttle — all optional with sensible defaults
    THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),
    THROTTLE_DEFAULT_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
    THROTTLE_AUTH_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_NONCE_LIMIT: z.coerce.number().int().positive().default(30),
    THROTTLE_NONCE_TTL: z.coerce.number().int().positive().default(60),
  })
  .passthrough();

export type EnvConfig = z.infer<typeof envSchema>;

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
