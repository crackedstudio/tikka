import { Module } from "@nestjs/common";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";
import { LedgerPollerService } from "./ledger-poller.service";
import { EventHandlersModule } from "./event-handlers.module";

@Module({
  imports: [EventHandlersModule],
  providers: [CursorManagerService, EventParserService, LedgerPollerService],
  exports: [
    CursorManagerService,
    EventParserService,
    LedgerPollerService,
    EventHandlersModule,
  ],
})
export class IngestorModule {}
