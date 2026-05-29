import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeysModule } from '../keys/keys.module';
import { supabaseProvider } from './supabase.provider';
import { AuditLogService } from './audit-log.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [ConfigModule, KeysModule],
  providers: [supabaseProvider, AuditLogService],
  controllers: [AuditController],
  exports: [AuditLogService],
})
export class AuditLogModule {}
