import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { LagMonitorService } from './lag-monitor.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, LagMonitorService],
  exports: [HealthService, LagMonitorService],
})
export class HealthModule {}
