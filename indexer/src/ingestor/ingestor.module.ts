import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";
import { LedgerPollerService } from "./ledger-poller.service";
import { EventHandlersModule } from "./event-handlers.module";
import { DryRunService } from "./dry-run.service";
import { IngestionDispatcherService } from "./ingestion-dispatcher.service";
import { ProcessorsModule } from "../processors/processors.module";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";

@Module({
  imports: [EventHandlersModule, ProcessorsModule, TypeOrmModule.forFeature([IndexerCursorEntity])],
  providers: [
    CursorManagerService,
    EventParserService,
    LedgerPollerService,
    DryRunService,
    IngestionDispatcherService,
  ],
  exports: [
    CursorManagerService,
    EventParserService,
    LedgerPollerService,
    DryRunService,
    IngestionDispatcherService,
    EventHandlersModule,
  ],
})
export class IngestorModule {}
