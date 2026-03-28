import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '../../../middleware/throttle.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { AdminGuard } from './admin.guard';
import { MonitorService } from './monitor.service';
import { JobsQueryDto } from './dto/jobs-query.dto';
import { LatencyQueryDto } from './dto/latency-query.dto';
import { ErrorsQueryDto } from './dto/errors-query.dto';

@Controller('monitor')
@UseGuards(AdminGuard)
@Public()
@SkipThrottle()
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get('jobs')
  async getJobs(@Query() query: JobsQueryDto) {
    return this.monitorService.getJobs(query);
  }

  @Get('stats')
  async getStats() {
    return this.monitorService.getStats();
  }

  @Get('latency')
  async getLatency(@Query() query: LatencyQueryDto) {
    return this.monitorService.getLatency(query);
  }

  @Get('errors')
  async getErrors(@Query() query: ErrorsQueryDto) {
    return this.monitorService.getErrors(query);
  }
}
