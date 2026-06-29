import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import {
  BackfillJobService,
  type BackfillJobConfig,
} from "../../../services/backfill-job.service";
import { SkipThrottle } from "../../../middleware/throttle.decorator";
import { Public } from "../../../auth/decorators/public.decorator";
import { AdminGuard } from "./admin.guard";
import { MonitorService } from "./monitor.service";
import { JobsQuerySchema, JobsQueryDto } from "./dto/jobs-query.dto";
import { LatencyQuerySchema, LatencyQueryDto } from "./dto/latency-query.dto";
import { ErrorsQuerySchema, ErrorsQueryDto } from "./dto/errors-query.dto";
import { AuditQuerySchema, AuditQueryDto } from "./dto/audit-query.dto";
import { createZodPipe } from "../raffles/pipes/zod-validation.pipe";
import { z } from "zod";
import { MaintenanceModeService } from "../../../maintenance/maintenance-mode.service";
import { SkipMaintenance } from "../../../maintenance/skip-maintenance.decorator";
import { AuditLogInterceptor } from "./audit-log.interceptor";

import { ApiProperty } from "@nestjs/swagger";

const SetMaintenanceModeSchema = z.object({
  enabled: z.coerce.boolean(),
});

const BackfillRequestSchema = z.object({
  fromLedger: z.coerce.number().int().positive(),
  toLedger: z.coerce.number().int().positive(),
});

class SetMaintenanceModeDto {
  @ApiProperty({ description: "Enable or disable maintenance mode" })
  enabled: boolean;
}

class BackfillRequestDto {
  @ApiProperty({ description: "Inclusive starting ledger", minimum: 1 })
  fromLedger: number;

  @ApiProperty({ description: "Inclusive ending ledger", minimum: 1 })
  toLedger: number;
}

@ApiTags("Monitor")
@ApiBearerAuth()
@Controller("monitor")
@UseGuards(AdminGuard)
@UseInterceptors(AuditLogInterceptor)
@Public()
@SkipThrottle()
export class MonitorController {
  constructor(
    private readonly monitorService: MonitorService,
    private readonly maintenanceModeService: MaintenanceModeService,
    private readonly backfillJobService: BackfillJobService,
  ) {}

  @Get("jobs")
  @ApiOperation({ summary: "Get background jobs status" })
  @ApiResponse({ status: 200, description: "Jobs retrieved successfully" })
  @UsePipes(new (createZodPipe(JobsQuerySchema))())
  async getJobs(@Query() query: JobsQueryDto) {
    return this.monitorService.getJobs(query);
  }

  @Get("stats")
  @ApiOperation({ summary: "Get system monitoring stats" })
  @ApiResponse({
    status: 200,
    description: "System stats retrieved successfully",
  })
  async getStats() {
    return this.monitorService.getStats();
  }

  @Get("latency")
  @ApiOperation({ summary: "Get system latency metrics" })
  @ApiResponse({
    status: 200,
    description: "Latency metrics retrieved successfully",
  })
  @UsePipes(new (createZodPipe(LatencyQuerySchema))())
  async getLatency(@Query() query: LatencyQueryDto) {
    return this.monitorService.getLatency(query);
  }

  @Get("errors")
  @ApiOperation({ summary: "Get system error logs" })
  @ApiResponse({ status: 200, description: "Errors retrieved successfully" })
  @UsePipes(new (createZodPipe(ErrorsQuerySchema))())
  async getErrors(@Query() query: ErrorsQueryDto) {
    return this.monitorService.getErrors(query);
  }

  @Get("audit")
  @ApiOperation({ summary: "Get system audit logs" })
  @ApiResponse({
    status: 200,
    description: "Audit logs retrieved successfully",
  })
  @UsePipes(new (createZodPipe(AuditQuerySchema))())
  async getAuditLogs(@Query() query: AuditQueryDto) {
    return this.monitorService.getAuditLogs(query);
  }

  @Post("backfill")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Trigger an async indexer backfill" })
  @ApiResponse({
    status: 202,
    description: "Backfill job accepted",
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string", format: "uuid" },
      },
    },
  })
  @ApiBody({ type: BackfillRequestDto })
  @UsePipes(new (createZodPipe(BackfillRequestSchema))())
  startBackfill(@Body() body: BackfillJobConfig) {
    try {
      const jobId = this.backfillJobService.startBackfill(body);
      return { jobId };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid backfill request",
      );
    }
  }

  @Get("backfill/:jobId")
  @ApiOperation({ summary: "Get async indexer backfill job status" })
  @ApiResponse({
    status: 200,
    description: "Backfill job status retrieved successfully",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["running", "completed", "failed"] },
        processedLedgers: { type: "number" },
      },
    },
  })
  getBackfillStatus(@Param("jobId") jobId: string) {
    const job = this.backfillJobService.getJobStatus(jobId);
    if (!job) {
      throw new NotFoundException(`Backfill job ${jobId} not found`);
    }

    return {
      status: job.status,
      processedLedgers: job.processedLedgers,
    };
  }

  @Get("maintenance")
  @ApiOperation({ summary: "Get maintenance mode status" })
  @ApiResponse({
    status: 200,
    description: "Maintenance mode status retrieved successfully",
  })
  @SkipMaintenance()
  getMaintenanceMode() {
    return {
      maintenanceMode: this.maintenanceModeService.isEnabled(),
    };
  }

  @Put("maintenance")
  @ApiOperation({ summary: "Set maintenance mode status" })
  @ApiResponse({
    status: 200,
    description: "Maintenance mode status updated successfully",
  })
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
