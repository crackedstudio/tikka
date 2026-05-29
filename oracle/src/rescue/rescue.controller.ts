import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RescueService } from './rescue.service';
import { VrfService } from '../randomness/vrf.service';

@Controller()
export class RescueController {
  constructor(
    private readonly rescueService: RescueService,
    private readonly vrfService: VrfService,
  ) {}

  /**
   * Re-enqueue a failed job
   * POST /rescue/re-enqueue
   */
  @Post('rescue/re-enqueue')
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
  @Post('rescue/force-submit')
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
  @Post('rescue/force-fail')
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
  @Get('rescue/failed-jobs')
  async getFailedJobs() {
    return this.rescueService.getFailedJobs();
  }

  /**
   * Get all jobs by state
   * GET /rescue/jobs
   */
  @Get('rescue/jobs')
  async getAllJobs() {
    return this.rescueService.getAllJobs();
  }

  /**
   * Get rescue audit logs
   * GET /rescue/logs
   */
  @Get('rescue/logs')
  async getRescueLogs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.rescueService.getRescueLogs(parsedLimit);
  }

  /**
   * Get rescue logs for a specific raffle
   * GET /rescue/logs/:raffleId
   */
  @Get('rescue/logs/:raffleId')
  async getRescueLogsByRaffle(@Param('raffleId') raffleId: string) {
    return this.rescueService.getRescueLogsByRaffle(parseInt(raffleId, 10));
  }

  /**
   * Verify an Ed25519-SHA256 VRF proof and derive the seed.
   * POST /oracle/verify
   */
  @Post('oracle/verify')
  @HttpCode(HttpStatus.OK)
  verifyOracleProof(
    @Body('requestId') requestId: string,
    @Body('proof') proof: string,
    @Body('publicKey') publicKey: string,
  ): { valid: boolean; seed?: string } {
    if (!requestId || !proof || !publicKey) {
      return { valid: false };
    }

    return this.vrfService.verifyProof({
      requestId,
      proof,
      publicKey,
    });
  }

  /**
   * Return this oracle's Ed25519 public key.
   * GET /oracle/public-key
   */
  @Get('oracle/public-key')
  async getOraclePublicKey() {
    return this.vrfService.getPublicKey();
  }
}
