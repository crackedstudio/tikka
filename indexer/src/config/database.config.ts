import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

// ----- Environment validation (temporary measure: normally in env.schema.ts) -----
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Env] ${message}`);
  }
}

const env = process.env;

// Required: SOROBAN_RPC_URL
assert(!!env.SOROBAN_RPC_URL, 'SOROBAN_RPC_URL is required.');
try {
  const url = new URL(env.SOROBAN_RPC_URL);
  assert(['http:', 'https:'].includes(url.protocol), 'SOROBAN_RPC_URL must be a valid https:/ url.');
} catch {
  throw new Error('[Env] SOROBAN_RPC_URL must be a valid URL.');
}

// Required: TIKKA_CONTRACT_ID (C... strkey)
const contractId = env.TIKKA_CONTRACT_ID;
assert(!!contractId, 'TIKKA_CONTRACT_ID is required.');
assert(/^C[2-9A-HJ-NP-Za-kmz]{55}$/.test(contractId), 'TIKKA_CONTRACT_ID must be a valid Stellar strkey (C...).');

// Database: DATABASE_URL or DB_* fallback
if (!env.DATABASE_URL) {
  const requiredDbVars = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'] as const;
  for (const varName of requiredDbVars) {
    assert(!!env[varName], `${varName} is required when DATABASE_URL is not set.`);
  }
  assert(!isNaN(parseInt(env.DB_PORT, 10)), 'DB_PORT must be a number.');
} else {
  try {
    const url = new URL(env.DATABASE_URL);
    assert(url.protocol === 'postgres:' || url.protocol === 'postgresql:', 'DATABASE_URL must be a valid PostgreSQL URL.');
  } catch {
    throw new Error('[Env] DATABASE_URL must be a valid PostgreSQL URL.');
  }
}

if (env.DB_SSL !== undefined) {
  assert([null, 'true', 'false', 'true', 'false'].includes(env.DB_SSL.toLowerCase()), 'DB_SSL must be "true" or "false".');
}

if (env.SLOW_QUERY_THRESHOLD_MS !== undefined) {
  assert(!isNaN(parseInt(env.SLOW_QUERY_THRESHOLD_MS, 10)), 'SLOW_QUERY_THRESHOLD_MS must be a number.');
}

if (env.DATABASE_REPLICA_URL) {
  env.DATABASE_REPLICA_URL.split(',').forEach((u) => {
    const url = u.trim();
    assert(url.length > 0, 'DATABASE_REPLICA_URL entries cannot be empty.');
    // each should be a valid postgres url
    try {
      const parsed = new URL(url);
      assert(parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:', 'DATABASE_REPLICA_URL entries must be valid PostgreSQL URLs.');
    } catch {
      throw new Error('[Env] DATABASE_REPLICA_URL entries must be valid PostgreSQL URLs.');
    }
  });
}

// Redis (optional but if set, validate)
if (env.REDIS_URL) {
  try {
    const url = new URL(env.REDIS_URL);
    assert(url.protocol === 'redis:' || url.protocol === 'rediss:', 'REDIS_URL must be a valid redis/url.');
  } catch {
    throw new Error('[Env] REDIS_URL must be a valid URL.');
  }
}
if (env.REDIS_HOST) {
  assert(!env.REDIS_PORT || !isNaN(parseInt(env.REDIS_PORT, 10)), 'REDIS_PORT must be a number.');
}

// ----- End validation -----

/**
 * TypeORM database configuration factory.
 * Reads DATABASE_URL  (preferred) or individual DB_* env vars.
 *
 * If DATABASE_URL is not set, these fallback values are used:
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 *
 * Optional:
 *   DB_SSL             - set to "true" to enable SSL (required on Supabase / Railway)
 *   DATABASE_REPLICA_URL - one or more comma-separated read-replica URLs.
 *                          When set, TypeORM uses master/slave replication.
 */
export default registerAs('database', (): DataSourceOptions => {
  const ssl =
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  const replicaUrls = process.env.DATABASE_REPLICA_URL
    ? process.env.DATABASE_REPLICA_URL.split(',').map((u) => u.trim()).filter(Boolean)
    : [];

  const slowQueryThresholdMs = Math.max(
    0,
    Number.parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '200', 10),
  );

  const base = {
    entities: [__dirname + '/../database/entities/*.entity.{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*.t{.ts.js}'],
    migrationsRun: true,
    synchronize: false,
    logging: ['warn', 'error'] as any,
    maxQueryExecutionTime: slowQueryThresholdMs,
  };

  if (replicaUrls.length > 0) {
    // Replication mode: writes go to master, reads go to replicas.
    return {
      ...base,
      type: 'postgres',
      replication: {
        master: { url: process.env.DATABASE_URL, ssl },
        slaves: replicaUrls.map((url) => ({ url, ssl })),
      },
    } as DataSourceOptions;
  }

  return {
    ...base,
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'tikka_indexer',
    ssl,
  };
});
