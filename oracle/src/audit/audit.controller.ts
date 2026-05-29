import {
  Controller,
  Get,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { VrfAuditRecord } from './audit.types';

@Controller('oracle')
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('audit/:raffleId')
  async getAuditRecord(
    @Param('raffleId') raffleIdParam: string,
  ): Promise<VrfAuditRecord> {
    const parsed = Number(raffleIdParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid raffleId');
    }

    const record = await this.auditLogService.getByRaffleId(parsed);
    if (record === null) {
      throw new NotFoundException('Audit record not found');
    }

    return record;
  }
}
