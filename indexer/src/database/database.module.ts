import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";
import { RaffleEntity } from "./entities/raffle.entity";
import { MetricsModule } from "../metrics/metrics.module";
import { MetricsService } from "../metrics/metrics.service";
import { TypeOrmQueryLogger } from "./typeorm-query.logger";
import { TicketEntity } from "./entities/ticket.entity";
import { UserEntity } from "./entities/user.entity";
import { RaffleEventEntity } from "./entities/raffle-event.entity";
import { PlatformStatEntity } from "./entities/platform-stat.entity";
import { PlatformStateEntity } from "./entities/platform-state.entity";
import { IndexerCursorEntity } from "./entities/indexer-cursor.entity";
import { WebhookEntity } from "./entities/webhook.entity";
import { DeadLetterEventEntity } from "./entities/dead-letter-event.entity";
import { ArchiveCheckpointEntity } from "./entities/archive-checkpoint.entity";

/**
 * DatabaseModule wires TypeORM into the NestJS DI container.
 *
 * Key behaviours:
 *  - Reads DB connection options from the 'database' config namespace
 *    (populated by src/config/database.config.ts from env vars).
 *  - Registers all entities so repositories can be injected anywhere.
 *  - Sets migrationsRun: true so pending migrations run on every bootstrap.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, MetricsModule],
      inject: [ConfigService, MetricsService],
      useFactory: (
        configService: ConfigService,
        metricsService: MetricsService,
      ): DataSourceOptions => {
        const databaseOptions = configService.get<DataSourceOptions>(
          "database",
        ) as DataSourceOptions;
        const slowQueryThresholdMs =
          databaseOptions.maxQueryExecutionTime ?? 200;

        return {
          ...databaseOptions,
          entities: [
            RaffleEntity,
            TicketEntity,
            UserEntity,
            RaffleEventEntity,
            PlatformStatEntity,
            PlatformStateEntity,
            IndexerCursorEntity,
            WebhookEntity,
            DeadLetterEventEntity,
            ArchiveCheckpointEntity,
          ],
          migrations: [__dirname + "/migrations/*{.ts,.js}"],
          migrationsRun: true,
          synchronize: false,
          logger: new TypeOrmQueryLogger(metricsService, slowQueryThresholdMs),
        };
      },
    }),
    // Export individual repositories for other modules to inject
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      RaffleEventEntity,
      PlatformStatEntity,
      PlatformStateEntity,
      IndexerCursorEntity,
      WebhookEntity,
      DeadLetterEventEntity,
      ArchiveCheckpointEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
