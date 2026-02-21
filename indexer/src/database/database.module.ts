import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";
import { RaffleEntity } from "./entities/raffle.entity";
import { TicketEntity } from "./entities/ticket.entity";
import { UserEntity } from "./entities/user.entity";
import { RaffleEventEntity } from "./entities/raffle-event.entity";
import { PlatformStatEntity } from "./entities/platform-stat.entity";
import { IndexerCursorEntity } from "./entities/indexer-cursor.entity";

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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DataSourceOptions => ({
        ...(configService.get<DataSourceOptions>(
          "database",
        ) as DataSourceOptions),
        entities: [
          RaffleEntity,
          TicketEntity,
          UserEntity,
          RaffleEventEntity,
          PlatformStatEntity,
          IndexerCursorEntity,
        ],
        migrations: [__dirname + "/migrations/*{.ts,.js}"],
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    // Export individual repositories for other modules to inject
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      RaffleEventEntity,
      PlatformStatEntity,
      IndexerCursorEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
