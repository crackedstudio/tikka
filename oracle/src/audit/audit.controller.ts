import {
  Controller,
  Get,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RandomnessAuditService } from './randomness-audit.service';
import { VrfAuditRecord } from './audit.types';
import { RandomnessAuditTrace } from './randomness-audit.types';

@Controller('oracle')
export class AuditController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly randomnessAuditService: RandomnessAuditService,
  ) {}

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

  @Get('audit/randomness/:requestId/trace')
  async getRandomnessTrace(
    @Param('requestId') requestId: string,
  ): Promise<RandomnessAuditTrace> {
    if (!requestId?.trim()) {
      throw new BadRequestException('Invalid requestId');
    }

    const trace = await this.randomnessAuditService.getTraceByRequestId(requestId);
    if (trace === null) {
      throw new NotFoundException('Randomness audit trace not found');
    }

    return trace;
  }
}
