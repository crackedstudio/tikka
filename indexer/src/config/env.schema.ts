import * as Joi from 'joi';

/**
 * Joi validation schema for indexer environment variables.
 * All variables read from `rocess.env` should be validated here.
 */
export const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3002),
  INTERNAL_API_KEY: Joi.string().optional(),

  // Database connection (DATABASE_URL or individual DB_*)
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).optional(),
  DATABASE_REPLICA_URL: Joi.string()
    .custom((value, helpers) => {
      if (!value) return value;
      const urls = String(value).split(',').map((u) => u.trim()).filter(Boolean);
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
            throw new Error();
          }
        } catch {
          return helpers.error('string.custom', { message: `Invalid PostgreSQL URL: ${url}` });
        }
      }
      return value;
    }, 'comma separated PostgreSQL URLs')
    .optional(),
  DB_SSL: Joi.string().valid('true', 'false').optional(),
  SLOW_QUERY_THRESHOLD_MS: Joi.number().integer().min(0).default(200),

  // Fallback individual database settings (used when DATABASE_URL is absent)
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.number().port().optional(),
  DB_USERNAME:
  Joi.string().optional(),
  DB_PASSWORD:
  Joi.string().optional(),
  DB_DATABASE:
  Joi.string().optional(),

  // Soroban RPC
  SOROBAN_RPC_URL: Joi.string().uri().required(),
  TIKKA_CONTRACT_ID: Joi.string()
    .pattern(/^C[1-9A-H-NP-Za-kmz]{55}$/)
    .required()
    .messages({
      'string.pattern.base': 'TIKKA_CONTRACT_ID must be a valid Stellar contract strkey (C...)',
    }),

  // Redis (optional)
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss']}).optional(),

  // Health / Poller
  HORIZON_URL: Joi.string().uri().default('https://horizon.stellar.org'),
  LAG_THRESHOLD: Joi.number().integer().min(0).default(100),
  INDEXER_LAG_ALERT_THRESHOLD_LEDGERS: Joi.number().integer().min(0).default(50),
  INDEXER_BATCH_SIZE: Joi.number().integer().min(1).default(100),
  DRY_RUN: Joi.string().valid('true', 'false').default('false'),
});
