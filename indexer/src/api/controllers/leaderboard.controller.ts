import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { CacheService } from '../../cache/cache.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async getLeaderboard(
    @Query('by') by: 'wins' | 'volume' | 'tickets' = 'wins',
    @Query('limit') limit: number = 50,
  ) {
    const cacheKey = `leaderboard:${by}:${limit}`;
    // Use generic leaderboard key for invalidation if needed, or specific one
    // Requirements said "leaderboard" key.
    
    return this.cacheService.wrap('leaderboard', 60, async () => {
      const query = this.userRepo.createQueryBuilder('user');

      if (by === 'wins') {
        query.orderBy('user.totalRafflesWon', 'DESC');
      } else if (by === 'volume') {
        query.orderBy('user.totalPrizeXlm', 'DESC');
      } else if (by === 'tickets') {
        query.orderBy('user.totalTicketsBought', 'DESC');
      }

      query.take(limit);

      const entries = await query.getMany();
      return { entries };
    });
  }
}
