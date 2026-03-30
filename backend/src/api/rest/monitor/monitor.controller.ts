import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@Controller('monitor')
@UseGuards(AdminGuard)
@Public()
@SkipThrottle()
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

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
}
