import { Module } from "@nestjs/common";
import { CursorManagerService } from "./cursor-manager.service";
import { EventParserService } from "./event-parser.service";
import { LedgerPollerService } from "./ledger-poller.service";

@Module({
  providers: [CursorManagerService, EventParserService, LedgerPollerService],
  exports: [CursorManagerService, EventParserService, LedgerPollerService],
})
export class IngestorModule {}
