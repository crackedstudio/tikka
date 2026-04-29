import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardQuerySchema, LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@ApiTags('Leaderboard')
@Controller('leaderboard')
@Public()
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * GET /leaderboard — Top participants.
   * Query params:
   *   by    — Sort field: wins | volume | tickets (default: wins)
   *   limit — Number of entries: 1–100 (default: 20)
   */
  @Get()
  @ApiOperation({ summary: 'Get top participants leaderboard' })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  @UsePipes(new (createZodPipe(LeaderboardQuerySchema))())
  async getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }
}
