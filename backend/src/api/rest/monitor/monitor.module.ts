import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../../../services/supabase.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [SupabaseModule, ConfigModule],
  controllers: [MonitorController],
  providers: [MonitorService, AdminGuard],
})
export class MonitorModule {}
