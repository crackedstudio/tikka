import { Module } from '@nestjs/common';
import { TransparencyController } from './transparency.controller';
import { AuditLogService } from '../../../services/audit-log.service';
import { SupabaseModule } from '../../../services/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [TransparencyController],
  providers: [AuditLogService],
})
export class TransparencyModule {}
