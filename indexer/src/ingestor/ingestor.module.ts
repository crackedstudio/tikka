import { Module } from "@nestjs/common";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";
import { LedgerPollerService } from "./ledger-poller.service";
import { EventHandlersModule } from "./event-handlers.module";
import { DryRunService } from "./dry-run.service";

@Module({
  imports: [EventHandlersModule],
  providers: [
    CursorManagerService,
    EventParserService,
    LedgerPollerService,
    DryRunService,
  ],
  exports: [
    CursorManagerService,
    EventParserService,
    LedgerPollerService,
    DryRunService,
    EventHandlersModule,
  ],
})
export class IngestorModule {}
