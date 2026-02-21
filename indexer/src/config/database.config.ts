import { registerAs } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";

/**
 * TypeORM database configuration factory.
 * Reads DATABASE_URL (preferred) or individual DB_* env vars.
 *
 * Required env vars (if DATABASE_URL is not set):
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 *
 * Optional:
 *   DB_SSL   — set to "true" to enable SSL (required on Supabase / Railway)
 */
export default registerAs(
  "database",
  (): DataSourceOptions => ({
    type: "postgres",
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_DATABASE ?? "tikka_indexer",
    ssl:
      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    entities: [__dirname + "/../database/entities/*.entity{.ts,.js}"],
    migrations: [__dirname + "/../database/migrations/*{.ts,.js}"],
    /**
     * Run pending migrations automatically on every app bootstrap.
     * Safe because all migrations are idempotent.
     */
    migrationsRun: true,
    synchronize: false, // Never use synchronize=true in production
    logging: process.env.NODE_ENV !== "production",
  }),
);
