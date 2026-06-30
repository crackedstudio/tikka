import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RafflesController } from "./controllers/raffles.controller";
import { UsersController } from "./controllers/users.controller";
import { StatsController } from "./controllers/stats.controller";
import { LeaderboardController } from "./controllers/leaderboard.controller";
import { SnapshotController } from "./controllers/snapshot.controller";
import { TransparencyController } from "./controllers/transparency.controller";
import { ApiKeyGuard } from "./api-key.guard";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { PlatformStatEntity } from "../database/entities/platform-stat.entity";
import { DeadLetterEventEntity } from "../database/entities/dead-letter-event.entity";
import { CacheModule } from "../cache/cache.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { supabaseProvider } from "./supabase.provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      PlatformStatEntity,
      DeadLetterEventEntity,
    ]),
    CacheModule,
    MaintenanceModule,
    IngestorModule,
  ],
  controllers: [
    RafflesController,
    UsersController,
    StatsController,
    LeaderboardController,
    SnapshotController,
    TransparencyController,
  ],
  providers: [ApiKeyGuard, supabaseProvider],
})
export class ApiModule {}
