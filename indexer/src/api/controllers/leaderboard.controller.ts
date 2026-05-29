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
    @Query('cursor') cursor?: string,
    @Query('offset') offset?: number,
  ) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const safeOffset = offset == null ? undefined : Math.max(Number(offset) || 0, 0);

    // Keep previous cache behavior for the default first page only.
    if (!cursor && (safeOffset == null || safeOffset === 0)) {
      return this.cacheService.wrap('leaderboard', 60, async () =>
        this.queryLeaderboard(by, safeLimit),
      );
    }

    return this.queryLeaderboard(by, safeLimit, cursor, safeOffset);
  }

  private decodeCursor(cursor: string): { sortValue: string; address: string } | null {
    try {
      const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        v?: string;
        a?: string;
      };
      if (!payload.v || !payload.a) {
        return null;
      }
      return { sortValue: payload.v, address: payload.a };
    } catch {
      return null;
    }
  }

  private encodeCursor(sortValue: string, address: string): string {
    return Buffer.from(JSON.stringify({ v: sortValue, a: address }), 'utf8').toString('base64');
  }

  private sortExpression(by: 'wins' | 'volume' | 'tickets'): string {
    if (by === 'wins') return 'user.totalRafflesWon';
    if (by === 'tickets') return 'user.totalTicketsBought';
    return 'CAST(user.totalPrizeXlm AS NUMERIC)';
  }

  private sortValueForEntry(
    by: 'wins' | 'volume' | 'tickets',
    entry: UserEntity,
  ): string {
    if (by === 'wins') return String(entry.totalRafflesWon);
    if (by === 'tickets') return String(entry.totalTicketsBought);
    return String(entry.totalPrizeXlm);
  }

  private async queryLeaderboard(
    by: 'wins' | 'volume' | 'tickets',
    limit: number,
    cursor?: string,
    offset?: number,
  ): Promise<{ entries: UserEntity[]; nextCursor: string | null }> {
    const query = this.userRepo.createQueryBuilder('user');
    const sortExpr = this.sortExpression(by);

    query.orderBy(sortExpr, 'DESC').addOrderBy('user.address', 'ASC');

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      if (decoded) {
        query.andWhere(
          `(${sortExpr} < :cursorValue OR (${sortExpr} = :cursorValue AND user.address > :cursorAddress))`,
          {
            cursorValue: decoded.sortValue,
            cursorAddress: decoded.address,
          },
        );
      }
    } else if (offset != null && offset > 0) {
      // Deprecated offset support
      query.skip(offset);
    }

    query.take(limit + 1);
    const rows = await query.getMany();
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    const last = entries.at(-1);
    const nextCursor =
      hasMore && last
        ? this.encodeCursor(this.sortValueForEntry(by, last), last.address)
        : null;

    return { entries, nextCursor };
  }
}
