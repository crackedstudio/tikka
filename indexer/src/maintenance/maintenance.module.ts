import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnapshotService } from "./snapshot.service";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      IndexerCursorEntity,
    ]),
    ConfigModule,
  ],
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class MaintenanceModule {}
