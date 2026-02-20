import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@Public()
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * GET /leaderboard — Top participants by wins, volume, tickets.
   */
  @Get()
  async getLeaderboard() {
    return this.leaderboardService.getLeaderboard();
  }
}
