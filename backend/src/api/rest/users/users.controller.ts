import { Controller, Get, Param, Query, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Public } from '../../../auth/decorators/public.decorator';
import { UsersService } from './users.service';
import { UserHistoryQueryDto } from './dto/user-history-query.dto';
import { Throttle } from '../../../middleware/throttle.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/:address — User profile.
   * Returns: address, total_tickets_bought, total_raffles_entered,
   *          total_raffles_won, total_prize_xlm, first_seen_ledger, updated_at.
   */
  @Public()
  @Get(':address')
  @ApiOperation({ summary: 'Get user profile by Stellar address' })
  @ApiParam({ name: 'address', description: 'Stellar address of the user' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getByAddress(@Param('address') address: string) {
    return this.usersService.getByAddress(address);
  }

  /**
   * GET /users/:address/history — Paginated raffle participation history.
   * Query params: limit (1–100, default 20), offset (default 0).
   */
  @Public()
  @Get(':address/history')
  @ApiOperation({ summary: 'Get user raffle participation history' })
  @ApiParam({ name: 'address', description: 'Stellar address of the user' })
  @ApiResponse({ status: 200, description: 'User history retrieved successfully' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getHistory(
    @Param('address') address: string,
    @Query() query: UserHistoryQueryDto,
  ) {
    return this.usersService.getHistory(address, query);
  }

  /**
   * GET /users/:address/history/export?format=csv — Full history as a CSV download.
   * Requires JWT. Rate-limited to 1 request per minute per user.
   * Must be declared before :address/history/:id to avoid route conflicts.
   */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @Get(':address/history/export')
  @ApiOperation({ summary: 'Export full raffle participation history as CSV' })
  @ApiParam({ name: 'address', description: 'Stellar address of the user' })
  @ApiQuery({ name: 'format', enum: ['csv'], required: false, description: 'Export format (csv)' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded — 1 export per minute' })
  async exportHistory(
    @Param('address') address: string,
    @Res() reply: FastifyReply,
  ) {
    const csv = await this.usersService.getHistoryAsCsv(address);
    const filename = `tikka-history-${address}.csv`;

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  }
}
