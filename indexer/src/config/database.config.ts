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
 *   DB_SSL              — set to "true" to enable SSL (required on Supabase / Railway)
 *   DATABASE_REPLICA_URL — one or more comma-separated read-replica URLs.
 *                          When set, TypeORM uses master/slave replication.
 */
export default registerAs("database", (): DataSourceOptions => {
  const ssl =
    process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;

  const replicaUrls = process.env.DATABASE_REPLICA_URL
    ? process.env.DATABASE_REPLICA_URL.split(",").map((u) => u.trim()).filter(Boolean)
    : [];

  const base = {
    entities: [__dirname + "/../database/entities/*.entity{.ts,.js}"],
    migrations: [__dirname + "/../database/migrations/*{.ts,.js}"],
    migrationsRun: true,
    synchronize: false,
    logging: process.env.NODE_ENV !== "production",
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
