import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupabaseModule } from "../../../services/supabase.module";
import { AdminGuard } from "../monitor/admin.guard";
import { MonitorService } from "../monitor/monitor.service";
import { EmailTemplateService } from "../../../services/email-template.service";

@Module({
  imports: [SupabaseModule, ConfigModule],
  controllers: [SupportController],
  providers: [
    SupportService,
    AdminGuard,
    MonitorService,
    EmailTemplateService,
  ],
  exports: [SupportService],
})
export class SupportModule {}
