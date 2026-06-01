import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeysModule } from '../keys/keys.module';
import { supabaseProvider } from './supabase.provider';
import { AuditLogService } from './audit-log.service';
import { RandomnessAuditService } from './randomness-audit.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [ConfigModule, KeysModule],
  providers: [supabaseProvider, AuditLogService, RandomnessAuditService],
  controllers: [AuditController],
  exports: [AuditLogService, RandomnessAuditService],
})
export class AuditLogModule {}
