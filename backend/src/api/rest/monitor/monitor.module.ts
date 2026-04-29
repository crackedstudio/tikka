import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../../../services/supabase.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { AdminGuard } from './admin.guard';
import { AuditLogInterceptor } from './audit-log.interceptor';

@Module({
  imports: [SupabaseModule, ConfigModule],
  controllers: [MonitorController],
  providers: [MonitorService, AdminGuard, AuditLogInterceptor],
})
export class MonitorModule {}
