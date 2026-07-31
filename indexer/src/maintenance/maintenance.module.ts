import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnapshotService } from "./snapshot.service";
import { RaffleEntity } from "../database/entities/raffle.entity";
import { TicketEntity } from "../database/entities/ticket.entity";
import { UserEntity } from "../database/entities/user.entity";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { DeadLetterEventEntity } from "../database/entities/dead-letter-event.entity";
import { PlatformStatEntity } from "../database/entities/platform-stat.entity";
import { PlatformStateEntity } from "../database/entities/platform-state.entity";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { ArchiveCheckpointEntity } from "../database/entities/archive-checkpoint.entity";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RaffleEntity,
      TicketEntity,
      UserEntity,
      IndexerCursorEntity,
      RaffleEventEntity,
      DeadLetterEventEntity,
      PlatformStatEntity,
      PlatformStateEntity,
      WebhookEntity,
      ArchiveCheckpointEntity,
    ]),
    ConfigModule,
  ],
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class MaintenanceModule {}
