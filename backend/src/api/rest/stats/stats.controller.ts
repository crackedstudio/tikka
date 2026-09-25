import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { StatsService } from './stats.service';
import { VerifyDrawBodyDto, VerifyDrawQueryDto } from './dto/verify-draw.dto';

@ApiTags('Stats')
@Controller('stats')
@Public()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /** GET /stats/platform — Platform-wide aggregates. */
  @Get('platform')
  @ApiOperation({ summary: 'Get platform-wide aggregates' })
  @ApiResponse({ status: 200, description: 'Platform stats retrieved successfully' })
  async getPlatformStats() {
    return this.statsService.getPlatformStats();
  }

  /** GET /stats/transparency — Platform stats + oracle key + recent audit log. */
  @Get('transparency')
  async getTransparencyStats() {
    return this.statsService.getTransparencyStats();
  }

  /** POST /stats/verify — Verify a VRF draw result with 60-second caching. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyDraw(@Body() body: VerifyDrawBodyDto) {
    return this.statsService.verifyDraw(
      body.oracle_public_key,
      body.request_id,
      body.proof,
      body.seed,
    );
  }

  /** GET /stats/verify?txHash=:hash — Verify a VRF draw result by its transaction hash. */
  @Get('verify')
  async verifyDrawByTxHash(@Query() query: VerifyDrawQueryDto) {
    return this.statsService.verifyByTxHash(query.txHash);
  }
}
