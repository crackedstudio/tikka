import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { SkipThrottle } from '../../../middleware/throttle.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { AdminGuard } from './admin.guard';
import { MonitorService } from './monitor.service';
import {
  JobsQuerySchema,
  JobsQueryDto,
} from './dto/jobs-query.dto';
import {
  LatencyQuerySchema,
  LatencyQueryDto,
} from './dto/latency-query.dto';
import {
  ErrorsQuerySchema,
  ErrorsQueryDto,
} from './dto/errors-query.dto';
import {
  AuditQuerySchema,
  AuditQueryDto,
} from './dto/audit-query.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';
import { z } from 'zod';
import { MaintenanceModeService } from '../../../maintenance/maintenance-mode.service';
import { SkipMaintenance } from '../../../maintenance/skip-maintenance.decorator';
import { AuditLogInterceptor } from './audit-log.interceptor';

import { ApiProperty } from '@nestjs/swagger';

const SetMaintenanceModeSchema = z.object({
  enabled: z.coerce.boolean(),
});

class SetMaintenanceModeDto {
  @ApiProperty({ description: 'Enable or disable maintenance mode' })
  enabled: boolean;
}

@ApiTags('Monitor')
@ApiBearerAuth()
@Controller('monitor')
@UseGuards(AdminGuard)
@UseInterceptors(AuditLogInterceptor)
@Public()
@SkipThrottle()
export class MonitorController {
  constructor(
    private readonly monitorService: MonitorService,
    private readonly maintenanceModeService: MaintenanceModeService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Get background jobs status' })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  @UsePipes(new (createZodPipe(JobsQuerySchema))())
  async getJobs(@Query() query: JobsQueryDto) {
    return this.monitorService.getJobs(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get system monitoring stats' })
  @ApiResponse({ status: 200, description: 'System stats retrieved successfully' })
  async getStats() {
    return this.monitorService.getStats();
  }

  @Get('latency')
  @ApiOperation({ summary: 'Get system latency metrics' })
  @ApiResponse({ status: 200, description: 'Latency metrics retrieved successfully' })
  @UsePipes(new (createZodPipe(LatencyQuerySchema))())
  async getLatency(@Query() query: LatencyQueryDto) {
    return this.monitorService.getLatency(query);
  }

  @Get('errors')
  @ApiOperation({ summary: 'Get system error logs' })
  @ApiResponse({ status: 200, description: 'Errors retrieved successfully' })
  @UsePipes(new (createZodPipe(ErrorsQuerySchema))())
  async getErrors(@Query() query: ErrorsQueryDto) {
    return this.monitorService.getErrors(query);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get system audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @UsePipes(new (createZodPipe(AuditQuerySchema))())
  async getAuditLogs(@Query() query: AuditQueryDto) {
    return this.monitorService.getAuditLogs(query);
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Get maintenance mode status' })
  @ApiResponse({ status: 200, description: 'Maintenance mode status retrieved successfully' })
  @SkipMaintenance()
  getMaintenanceMode() {
    return {
      maintenanceMode: this.maintenanceModeService.isEnabled(),
    };
  }

  @Put('maintenance')
  @ApiOperation({ summary: 'Set maintenance mode status' })
  @ApiResponse({ status: 200, description: 'Maintenance mode status updated successfully' })
  @ApiBody({ type: SetMaintenanceModeDto })
  @SkipMaintenance()
  @UsePipes(new (createZodPipe(SetMaintenanceModeSchema))())
  setMaintenanceMode(@Body() body: SetMaintenanceModeDto) {
    this.maintenanceModeService.setEnabled(body.enabled);
    return {
      maintenanceMode: this.maintenanceModeService.isEnabled(),
    };
  }
}
