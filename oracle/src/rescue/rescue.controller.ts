import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RescueService } from './rescue.service';

@Controller('rescue')
export class RescueController {
  constructor(private readonly rescueService: RescueService) {}

  /**
   * Re-enqueue a failed job
   * POST /rescue/re-enqueue
   */
  @Post('re-enqueue')
  @HttpCode(HttpStatus.OK)
  async reEnqueueJob(
    @Body('jobId') jobId: string,
    @Body('operator') operator: string,
    @Body('reason') reason: string,
  ) {
    return this.rescueService.reEnqueueJob(jobId, operator, reason);
  }

  /**
   * Force submit randomness for a raffle
   * POST /rescue/force-submit
   */
  @Post('force-submit')
  @HttpCode(HttpStatus.OK)
  async forceSubmit(
    @Body('raffleId') raffleId: number,
    @Body('requestId') requestId: string,
    @Body('operator') operator: string,
    @Body('reason') reason: string,
    @Body('prizeAmount') prizeAmount?: number,
  ) {
    return this.rescueService.forceSubmit(raffleId, requestId, operator, reason, prizeAmount);
  }

  /**
   * Force fail a job (mark as invalid/malicious)
   * POST /rescue/force-fail
   */
  @Post('force-fail')
  @HttpCode(HttpStatus.OK)
  async forceFail(
    @Body('jobId') jobId: string,
    @Body('operator') operator: string,
    @Body('reason') reason: string,
  ) {
    return this.rescueService.forceFail(jobId, operator, reason);
  }

  /**
   * Get failed jobs
   * GET /rescue/failed-jobs
   */
  @Get('failed-jobs')
  async getFailedJobs() {
    return this.rescueService.getFailedJobs();
  }

  /**
   * Get all jobs by state
   * GET /rescue/jobs
   */
  @Get('jobs')
  async getAllJobs() {
    return this.rescueService.getAllJobs();
  }

  /**
   * Get rescue audit logs
   * GET /rescue/logs
   */
  @Get('logs')
  async getRescueLogs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.rescueService.getRescueLogs(parsedLimit);
  }

  /**
   * Get rescue logs for a specific raffle
   * GET /rescue/logs/:raffleId
   */
  @Get('logs/:raffleId')
  async getRescueLogsByRaffle(@Param('raffleId') raffleId: string) {
    return this.rescueService.getRescueLogsByRaffle(parseInt(raffleId, 10));
  }
}
