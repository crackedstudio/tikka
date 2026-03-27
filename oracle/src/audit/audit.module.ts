import { Module } from '@nestjs/common';
import { AuditLoggerService } from './audit-logger.service';

@Module({
  providers: [AuditLoggerService],
  exports: [AuditLoggerService],
})
export class AuditModule {}
