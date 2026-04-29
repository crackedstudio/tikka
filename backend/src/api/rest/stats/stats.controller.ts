import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
@Public()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /stats/platform — Platform-wide aggregates (raffles, tickets, volume, etc.).
   */
  @Get('platform')
  @ApiOperation({ summary: 'Get platform-wide aggregates' })
  @ApiResponse({ status: 200, description: 'Platform stats retrieved successfully' })
  async getPlatformStats() {
    return this.statsService.getPlatformStats();
  }
}
