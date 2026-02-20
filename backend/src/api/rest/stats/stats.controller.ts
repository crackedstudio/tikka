import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { StatsService } from './stats.service';

@Controller('stats')
@Public()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /stats/platform — Platform-wide aggregates (raffles, tickets, volume, etc.).
   */
  @Get('platform')
  async getPlatformStats() {
    return this.statsService.getPlatformStats();
  }
}
