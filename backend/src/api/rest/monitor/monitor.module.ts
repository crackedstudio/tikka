import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseModule } from "../../../services/supabase.module";
import { MonitorController } from "./monitor.controller";
import { MonitorService } from "./monitor.service";
import { ReplayController } from "./replay.controller";
import { ReplayService } from "../../../services/replay.service";
import { BackfillJobService } from "../../../services/indexer/backfill-job.service";
import { IndexerBackfillService } from "../../../services/indexer/indexer-backfill.service";
import { AdminGuard } from "./admin.guard";
import { BackfillLock } from "../../../services/indexer/backfill-lock";
import { HorizonClientService } from "../../../services/horizon-client.service";
import { IndexerService } from "../../../services/indexer/indexer.service";
import { AuditLogInterceptor } from "./audit-log.interceptor";

@Module({
  imports: [SupabaseModule, ConfigModule],
  controllers: [MonitorController, ReplayController],
  providers: [
    MonitorService,
    ReplayService,
    BackfillJobService,
    IndexerBackfillService,
    AdminGuard,
    BackfillLock,
    HorizonClientService,
    IndexerService,
    AuditLogInterceptor,
  ],
})
export class MonitorModule {}
