import { DataSource, DataSourceOptions } from "typeorm";
import { RaffleEntity } from "./database/entities/raffle.entity";
import { TicketEntity } from "./database/entities/ticket.entity";
import { UserEntity } from "./database/entities/user.entity";
import { RaffleEventEntity } from "./database/entities/raffle-event.entity";
import { PlatformStatEntity } from "./database/entities/platform-stat.entity";
import { IndexerCursorEntity } from "./database/entities/indexer-cursor.entity";

/**
 * Standalone DataSource for the TypeORM CLI.
 * Used by `migration:run`, `migration:revert`, and `migration:generate` scripts.
 *
 * Set DATABASE_URL (or individual DB_* vars) before running CLI commands:
 *   export DATABASE_URL=postgres://user:pass@localhost:5432/tikka_indexer
 *   npm run migration:run
 */
const options: DataSourceOptions = {
  type: "postgres",
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: process.env.DB_DATABASE ?? "tikka_indexer",
  ssl:
    process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  entities: [
    RaffleEntity,
    TicketEntity,
    UserEntity,
    RaffleEventEntity,
    PlatformStatEntity,
    IndexerCursorEntity,
  ],
  migrations: [__dirname + "/database/migrations/*{.ts,.js}"],
  synchronize: false,
  logging: true,
};

export const AppDataSource = new DataSource(options);
