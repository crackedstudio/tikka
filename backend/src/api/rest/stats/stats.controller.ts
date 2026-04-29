import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { StatsService } from './stats.service';

@Controller('stats')
@Public()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /** GET /stats/platform — Platform-wide aggregates. */
  @Get('platform')
  async getPlatformStats() {
    return this.statsService.getPlatformStats();
  }

  /** GET /stats/transparency — Platform stats + oracle key + recent audit log. */
  @Get('transparency')
  async getTransparencyStats() {
    return this.statsService.getTransparencyStats();
  }

  /** POST /stats/verify — Verify a VRF draw result. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyDraw(
    @Body('oracle_public_key') oraclePublicKey: string,
    @Body('request_id') requestId: string,
    @Body('proof') proof: string,
    @Body('seed') seed: string,
  ) {
    return this.statsService.verifyDraw(oraclePublicKey, requestId, proof, seed);
  }
}
