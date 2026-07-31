import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { VrfAuditRecord, AuditStatus } from './audit.types';

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

  @Get('audit')
  async getAuditByQuery(
    @Query('raffleId') raffleIdParam?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<VrfAuditRecord | VrfAuditRecord[]> {
    // Query by raffle ID
    if (raffleIdParam) {
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

    // Query by time range
    if (from || to) {
      const fromDate = from || '1970-01-01T00:00:00Z';
      const toDate = to || new Date().toISOString();

      return this.auditLogService.getByTimeRange(fromDate, toDate, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        status: status as AuditStatus | undefined,
      });
    }

    // Query by status
    if (status) {
      if (!['committed', 'revealed', 'abandoned'].includes(status)) {
        throw new BadRequestException('Invalid status. Must be: committed, revealed, or abandoned');
      }

      return this.auditLogService.getByStatus(status as AuditStatus, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
    }

    throw new BadRequestException('Provide raffleId, from/to dates, or status query parameter');
  }

  @Get('audit/summary')
  async getAuditSummary() {
    return this.auditLogService.getSummary();
  }
}
