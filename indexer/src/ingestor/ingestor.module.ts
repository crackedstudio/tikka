import { Module } from "@nestjs/common";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";
import { LedgerPollerService } from "./ledger-poller.service";
import { DryRunService } from "./dry-run.service";

@Module({
  providers: [CursorManagerService, EventParserService, LedgerPollerService, DryRunService],
  exports: [CursorManagerService, EventParserService, LedgerPollerService, DryRunService],
})
export class IngestorModule {}
