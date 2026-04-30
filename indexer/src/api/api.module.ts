import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RafflesController } from "./controllers/raffles.controller";
import { UsersController } from "./controllers/users.controller";
import { StatsController } from "./controllers/stats.controller";
import { SnapshotController } from "./controllers/snapshot.controller";
import { ApiKeyGuard } from "./api-key.guard";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { PlatformStatEntity } from "../database/entities/platform-stat.entity";
import { CacheModule } from "../cache/cache.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      PlatformStatEntity,
    ]),
    CacheModule,
    MaintenanceModule,
  ],
  controllers: [
    RafflesController,
    UsersController,
    StatsController,
    SnapshotController,
  ],
  providers: [ApiKeyGuard],
})
export class ApiModule {}
