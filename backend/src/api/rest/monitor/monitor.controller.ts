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
import { SkipThrottle } from '../../../middleware/throttle.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { AdminGuard } from './admin.guard';
import { MonitorService } from './monitor.service';
import {
  JobsQuerySchema,
  type JobsQueryDto,
} from './dto/jobs-query.dto';
import {
  LatencyQuerySchema,
  type LatencyQueryDto,
} from './dto/latency-query.dto';
import {
  ErrorsQuerySchema,
  type ErrorsQueryDto,
} from './dto/errors-query.dto';
import {
  AuditQuerySchema,
  type AuditQueryDto,
} from './dto/audit-query.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';
import { z } from 'zod';
import { MaintenanceModeService } from '../../../maintenance/maintenance-mode.service';
import { SkipMaintenance } from '../../../maintenance/skip-maintenance.decorator';
import { AuditLogInterceptor } from './audit-log.interceptor';

const SetMaintenanceModeSchema = z.object({
  enabled: z.coerce.boolean(),
});

type SetMaintenanceModeDto = z.infer<typeof SetMaintenanceModeSchema>;

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
  @UsePipes(new (createZodPipe(JobsQuerySchema))())
  async getJobs(@Query() query: JobsQueryDto) {
    return this.monitorService.getJobs(query);
  }

  @Get('stats')
  async getStats() {
    return this.monitorService.getStats();
  }

  @Get('latency')
  @UsePipes(new (createZodPipe(LatencyQuerySchema))())
  async getLatency(@Query() query: LatencyQueryDto) {
    return this.monitorService.getLatency(query);
  }

  @Get('errors')
  @UsePipes(new (createZodPipe(ErrorsQuerySchema))())
  async getErrors(@Query() query: ErrorsQueryDto) {
    return this.monitorService.getErrors(query);
  }

  @Get('audit')
  @UsePipes(new (createZodPipe(AuditQuerySchema))())
  async getAuditLogs(@Query() query: AuditQueryDto) {
    return this.monitorService.getAuditLogs(query);
  }

  @Get('maintenance')
  @SkipMaintenance()
  getMaintenanceMode() {
    return {
      maintenanceMode: this.maintenanceModeService.isEnabled(),
    };
  }

  @Put('maintenance')
  @SkipMaintenance()
  @UsePipes(new (createZodPipe(SetMaintenanceModeSchema))())
  setMaintenanceMode(@Body() body: SetMaintenanceModeDto) {
    this.maintenanceModeService.setEnabled(body.enabled);
    return {
      maintenanceMode: this.maintenanceModeService.isEnabled(),
    };
  }
}
