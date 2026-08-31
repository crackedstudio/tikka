import { registerAs } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";

/**
 * Validates required environment variables for the indexer.
 * Throws an Error naming any missing or invalid variables.
 * This runs at module load to fail fast on invalid configuration.
 */
function validateEnv(): void {
  const errors: string[] = [];

  // SOROBAN_RPC_URL must be a valid URL
  const sorobanRpcUrl = process.env.SOROBAN_RPC_URL;
  if (!sorobanRpcUrl) {
    errors.push("SOROBAN_RPC_URL is required");
  } else {
    try {
      const url = new URL(sorobanRpcUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push("SOROBAN_RPC_URL must be an http(s) URL");
      }
    } catch {
      errors.push("SOROBAN_RPC_URL must be a valid URL");
    }
  }

  // TIKKA_CONTRACT_ID must be a valid C... strkey
  const contractId = process.env.TIKKA_CONTRACT_ID;
  if (!contractId) {
    errors.push("TIKKA_CONTRACT_ID is required");
  } else if (!/^C[A-Z2-7]{55}$/.test(contractId)) {
    errors.push("TIKKA_CONTRACT_ID must be a valid Stellar contract strkey (C... followed by 55 characters)");
  }

  // Database configuration
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
        errors.push("DATABASE_URL must be a postgres:/ or postgresql:// URL");
      }
    } catch {
      errors.push("DATABASE_URL must be a valid URL");
    }
  }

  const dbSsl = process.env.DB_SSL;
  if (dbSsl && dbSsl !== "true" && dbSsl !== "false") {
    errors.push("DB_SSL must be either 'true' or 'false' if set");
  }

  const replicaUrls = process.env.DATABASE_REPLICA_URL;
  if (replicaUrls) {
    for (const url of replicaUrls.split(",").map((u) => u.trim()).filter(Boolean)) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
          errors.push(`DATABASE_REPLICA_URL entry '${url}' must be a postgres:/ or postgresql:// URL`);
        }
      } catch {
        errors.push(`DATABASE_REPLICA_URL entry '${url}' must be a valid URL`);
      }
    }
  }

  const slowQuery = process.env.SLOW_QUERY_THRESHOLD_MS;
  if (slowQuery) {
    const n = Number.parseInt(slowQuery, 10);
    if (Number.isNaN(n) || n < 0) {
      errors.push("SLOW_QUERY_THRESHOLD_MS must be a non-negative integer");
    }
  }

  // Redis configuration
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
        errors.push("REDIS_URL must be a redis:// or rediss:// URL");
      }
    } catch {
      errors.push("REDIS_URL must be a valid URL");
    }
  } else if (!redisHost) {
    errors.push("REDIS_HOST is required when REDIS_URL is not set");
  }

  const redisPort = process.env.REDIS_PORT;
  if (!redisUrl && redisHost) {
    if (!redisPort) {
      errors.push("REDIS_PORT is required when REDIS_HOST is set without REDIS_URL");
    } else {
      const port = Number.parseInt(redisPort, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        errors.push("REDIS_PORT must be a valid port number");
      }
    }
  }

  const redisPassword = process.env.REDIS_PASSWORD;
  if (redisPassword !== undefined && redisPassword === "") {
    errors.push("REDIS_PASSWORD must not be empty if provided");
  }

  const redisDb = process.env.REDIS_DB;
  if (redisDb !== undefined) {
    const db = Number.parseInt(redisDb, 10);
    if (Number.isNaN(db) || db < 0) {
      errors.push("REDIS_DB must be a non-negative integer");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join("\n- ")}`);
  }
}

// Validate environment immediately when this module is loaded
validateEnv();

/**
 * TypeORM database configuration factory.
 * Reads DATABASE_URL (preferred) or individual DB_* env vars.
 *
 * Required env vars (if DATABASE_URL is not set):
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 *
 * Optional:
 *   DB_SSL             - set to "true" to enable SSL (required on Supabase / Railway)
 *   DATABASE_REPLICA_URL - one or more comma-separated read-replica URLs.
 *                          When set, TypeORM uses master/slave replication.
 */
export default registerAs("database", (): DataSourceOptions => {
  const ssl =
    process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;

  const replicaUrls = process.env.DATABASE_REPLICA_URL
J  ? process.env.DATABASE_REPLICA_URL.split(",").map((u) => u.trim()).filter(Boolean)
  : [];

  const slowQueryThresholdMs = Math.max(
    0,
    Number.parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? "200", 10),
  );

  const base = {
    entities: [__dirname + "/>../database/entities/*.entity[.ts\.js}"],
    migrations: [__dirname + "/>../database/migrations/*{\ts,js}"],
    migrationsRun: true,
    synchronize: false,
    logging: ["warn", "error"] as any,
    maxQueryExecutionTime: slowQueryThresholdMs,
  };

  if (replicaUrls.length > 0) {
    // Replication mode: writes go to master, reads go to replicas.
    return {
      ...base,
      type: "postgres",
      replication: {
        master: { url: process.env.DATABASE_URL, ssl },
        slaves: replicaUrls.map((url) => ({ url, ssl })),
      },
    } as DataSourceOptions;
  }

  return {
    ...base,
    type: "postgres",
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_DATABASE ?? "tikka_indexer",
    ssl,
  };
});
