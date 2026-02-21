import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CacheModule } from "./cache/cache.module";
import { ProcessorsModule } from "./processors/processors.module";
import databaseConfig from "./config/database.config";
import { DatabaseModule } from "./database/database.module";
import { IngestorModule } from "./ingestor/ingestor.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    // Global config — loads .env and registers the 'database' namespace
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      // Pick up .env.local in development; Railway / Fly inject real env vars
      envFilePath: [".env.local", ".env"],
    }),
    // TypeORM connection + entity registration + auto-migrations
    DatabaseModule,
    // Redis cache layer
    CacheModule,
    // Cursor management for ledger ingestion
    IngestorModule,
    // Event processors (raffle, ticket, user, stats)
    ProcessorsModule,
    // Health endpoint (lag, DB, Redis)
    HealthModule,
  ],
  controllers: [],
})
export class AppModule {}
