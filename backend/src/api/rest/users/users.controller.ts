import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { UsersService } from './users.service';
import { UserHistoryQuerySchema, UserHistoryQueryDto } from './dto/user-history-query.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@ApiTags('Users')
@Controller('users')
@Public()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/:address — User profile.
   * Returns: address, total_tickets_bought, total_raffles_entered,
   *          total_raffles_won, total_prize_xlm, first_seen_ledger, updated_at.
   */
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
  @Get(':address/history')
  @ApiOperation({ summary: 'Get user raffle participation history' })
  @ApiParam({ name: 'address', description: 'Stellar address of the user' })
  @ApiResponse({ status: 200, description: 'User history retrieved successfully' })
  @UsePipes(new (createZodPipe(UserHistoryQuerySchema))())
  async getHistory(
    @Param('address') address: string,
    @Query() query: UserHistoryQueryDto,
  ) {
    return this.usersService.getHistory(address, query);
  }
}
