import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { ReplayService, type ReplayJobConfig, type ReplayJobStatus } from '../../../services/replay.service';
import { AdminGuard } from './admin.guard';
import { AdminScope } from './admin-scopes';
import { RequireAdminScopes } from './require-admin-scopes.decorator';
import { AuditLogInterceptor } from './audit-log.interceptor';

@ApiTags('Admin - Replay')
@ApiSecurity('admin-token')
@UseGuards(AdminGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/replay')
export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  /**
   * POST /admin/replay — Start a new replay job
   * Requires admin token in X-Admin-Token header
   */
  @Post()
  @RequireAdminScopes(AdminScope.ReplayWrite)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start a ledger replay job',
    description: 'Triggers an async replay of ledgers in the specified range. Returns a job ID for polling progress.',
  })
  @ApiResponse({
    status: 202,
    description: 'Replay job started',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', format: 'uuid' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid replay configuration',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing admin token',
  })
  async startReplay(@Body() config: ReplayJobConfig) {
    try {
      const jobId = this.replayService.startReplay(config);
      return {
        jobId,
        message: `Replay job started. Poll /admin/replay/${jobId} for progress.`,
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid replay configuration',
      );
    }
  }

  /**
   * GET /admin/replay/:jobId — Get replay job status
   * Requires admin token in X-Admin-Token header
   */
  @Get(':jobId')
  @RequireAdminScopes(AdminScope.ReplayRead)
  @ApiOperation({
    summary: 'Get replay job status',
    description: 'Poll the status and progress of a replay job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
        config: { type: 'object' },
        progress: { type: 'object' },
        result: { type: 'object' },
        error: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        startedAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing admin token',
  })
  getJobStatus(@Param('jobId') jobId: string): ReplayJobStatus {
    const job = this.replayService.getJobStatus(jobId);
    if (!job) {
      throw new NotFoundException(`Replay job ${jobId} not found`);
    }
    return job;
  }
}
