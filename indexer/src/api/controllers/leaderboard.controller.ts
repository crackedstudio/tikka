import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { CacheService } from '../../cache/cache.service';

type LeaderboardMode = 'wins' | 'volume' | 'tickets';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async getLeaderboard(
    @Query('by') by: LeaderboardMode = 'wins',
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    const mode = this.normalizeMode(by);
    const safeLimit = this.clampNumber(limit, 1, 100, 50);
    const safeOffset = this.clampNumber(offset, 0, 10_000, 0);
    const cacheKey = `leaderboard:${mode}:${safeLimit}:${safeOffset}`;

    return this.cacheService.wrap(cacheKey, 60, async () => {
      const query = this.userRepo.createQueryBuilder('user');

      if (mode === 'wins') {
        query.orderBy('user.totalRafflesWon', 'DESC');
      } else if (mode === 'volume') {
        query.orderBy('user.totalPrizeXlm::numeric', 'DESC');
      } else if (mode === 'tickets') {
        query.orderBy('user.totalTicketsBought', 'DESC');
      }

      query
        .addOrderBy('user.totalPrizeXlm::numeric', 'DESC')
        .addOrderBy('user.totalTicketsBought', 'DESC')
        .addOrderBy('user.totalRafflesWon', 'DESC')
        .addOrderBy('user.firstSeenLedger', 'ASC')
        .addOrderBy('user.address', 'ASC')
        .skip(safeOffset)
        .take(safeLimit);

      const entries = await query.getMany();
      return {
        by: mode,
        limit: safeLimit,
        offset: safeOffset,
        ranking: this.rankingSemantics(mode),
        entries: entries.map((entry, index) => ({
          rank: safeOffset + index + 1,
          address: entry.address,
          totalTicketsBought: entry.totalTicketsBought,
          totalRafflesWon: entry.totalRafflesWon,
          totalPrizeXlm: entry.totalPrizeXlm,
          firstSeenLedger: entry.firstSeenLedger,
        })),
      };
    });
  }

  private normalizeMode(by: LeaderboardMode): LeaderboardMode {
    return ['wins', 'volume', 'tickets'].includes(by) ? by : 'wins';
  }

  private clampNumber(
    value: number | string,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private rankingSemantics(mode: LeaderboardMode): string[] {
    const primary = {
      wins: 'totalRafflesWon desc',
      volume: 'totalPrizeXlm numeric desc',
      tickets: 'totalTicketsBought desc',
    };

    return [
      primary[mode],
      'totalPrizeXlm numeric desc',
      'totalTicketsBought desc',
      'totalRafflesWon desc',
      'firstSeenLedger asc',
      'address asc',
    ];
  }
}
