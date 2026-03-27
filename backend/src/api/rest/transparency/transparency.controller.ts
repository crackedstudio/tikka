import { Controller, Get, Query, Param, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { AuditLogService } from '../../../services/audit-log.service';
import { Throttle } from '@nestjs/throttler';

@Controller('transparency')
export class TransparencyController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /transparency
   * Returns paginated audit log entries, newest first.
   * Optionally filter by raffle_id.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60 } })
  @Get()
  async getAuditLog(
    @Query('raffle_id') raffleId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const parsedRaffleId = raffleId ? parseInt(raffleId, 10) : undefined;
    return this.auditLogService.getEntries({
      raffle_id: parsedRaffleId,
      limit: Math.min(limit, 200),
      offset,
    });
  }

  /**
   * GET /transparency/:requestId
   * Returns a single audit log entry by request_id.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60 } })
  @Get(':requestId')
  async getEntry(@Param('requestId') requestId: string) {
    return this.auditLogService.getEntryByRequestId(requestId);
  }
}
