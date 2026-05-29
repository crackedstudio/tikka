import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { CacheService } from '../../cache/cache.service';

type LeaderboardMode = 'wins' | 'volume' | 'tickets';

type LeaderboardEntry = {
  rank: number | null;
  address: string;
  totalTicketsBought: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
  firstSeenLedger: number;
};

type LeaderboardResponse = {
  by: LeaderboardMode;
  limit: number;
  offset: number | null;
  ranking: string[];
  entries: LeaderboardEntry[];
  nextCursor: string | null;
};

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
    @Query('cursor') cursor?: string,
    @Query('offset') offset?: number,
  ): Promise<LeaderboardResponse> {
    const mode = this.normalizeMode(by);
    const safeLimit = this.clampNumber(limit, 1, 100, 50);
    const safeOffset =
      offset == null ? undefined : this.clampNumber(offset, 0, 10_000, 0);

    if (!cursor && (safeOffset == null || safeOffset === 0)) {
      return this.cacheService.wrap(
        `leaderboard:${mode}:${safeLimit}:0`,
        60,
        async () => this.queryLeaderboard(mode, safeLimit, undefined, 0),
      );
    }

    return this.queryLeaderboard(mode, safeLimit, cursor, safeOffset);
  }

  private decodeCursor(cursor: string): { values: string[]; address: string } | null {
    try {
      const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        v?: string[];
        a?: string;
      };

      if (!Array.isArray(payload.v) || !payload.a) {
        return null;
      }

      return { values: payload.v, address: payload.a };
    } catch {
      return null;
    }
  }

  private encodeCursor(mode: LeaderboardMode, entry: UserEntity): string {
    return Buffer.from(
      JSON.stringify({
        v: this.sortValuesForEntry(mode, entry),
        a: entry.address,
      }),
      'utf8',
    ).toString('base64');
  }

  private primarySortExpression(mode: LeaderboardMode): string {
    if (mode === 'wins') return 'user.totalRafflesWon';
    if (mode === 'tickets') return 'user.totalTicketsBought';
    return 'CAST(user.totalPrizeXlm AS NUMERIC)';
  }

  private sortValuesForEntry(mode: LeaderboardMode, entry: UserEntity): string[] {
    const primary = {
      wins: String(entry.totalRafflesWon),
      volume: String(entry.totalPrizeXlm),
      tickets: String(entry.totalTicketsBought),
    };

    return [
      primary[mode],
      String(entry.totalPrizeXlm),
      String(entry.totalTicketsBought),
      String(entry.totalRafflesWon),
      String(entry.firstSeenLedger),
    ];
  }

  private async queryLeaderboard(
    mode: LeaderboardMode,
    limit: number,
    cursor?: string,
    offset?: number,
  ): Promise<LeaderboardResponse> {
    const query = this.userRepo.createQueryBuilder('user');
    const primarySort = this.primarySortExpression(mode);

    query
      .orderBy(primarySort, 'DESC')
      .addOrderBy('CAST(user.totalPrizeXlm AS NUMERIC)', 'DESC')
      .addOrderBy('user.totalTicketsBought', 'DESC')
      .addOrderBy('user.totalRafflesWon', 'DESC')
      .addOrderBy('user.firstSeenLedger', 'ASC')
      .addOrderBy('user.address', 'ASC');

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      if (decoded) {
        query.andWhere(
          `(
            ${primarySort} < :v0
            OR (${primarySort} = :v0 AND CAST(user.totalPrizeXlm AS NUMERIC) < :v1)
            OR (${primarySort} = :v0 AND CAST(user.totalPrizeXlm AS NUMERIC) = :v1 AND user.totalTicketsBought < :v2)
            OR (${primarySort} = :v0 AND CAST(user.totalPrizeXlm AS NUMERIC) = :v1 AND user.totalTicketsBought = :v2 AND user.totalRafflesWon < :v3)
            OR (${primarySort} = :v0 AND CAST(user.totalPrizeXlm AS NUMERIC) = :v1 AND user.totalTicketsBought = :v2 AND user.totalRafflesWon = :v3 AND user.firstSeenLedger > :v4)
            OR (${primarySort} = :v0 AND CAST(user.totalPrizeXlm AS NUMERIC) = :v1 AND user.totalTicketsBought = :v2 AND user.totalRafflesWon = :v3 AND user.firstSeenLedger = :v4 AND user.address > :address)
          )`,
          {
            v0: decoded.values[0],
            v1: decoded.values[1],
            v2: decoded.values[2],
            v3: decoded.values[3],
            v4: decoded.values[4],
            address: decoded.address,
          },
        );
      }
    } else if (offset != null && offset > 0) {
      query.skip(offset);
    }

    query.take(limit + 1);

    const rows = await query.getMany();
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    const last = entries.at(-1);
    const effectiveOffset = cursor ? null : offset ?? 0;

    return {
      by: mode,
      limit,
      offset: effectiveOffset,
      ranking: this.rankingSemantics(mode),
      entries: entries.map((entry, index) => ({
        rank: effectiveOffset == null ? null : effectiveOffset + index + 1,
        address: entry.address,
        totalTicketsBought: entry.totalTicketsBought,
        totalRafflesWon: entry.totalRafflesWon,
        totalPrizeXlm: entry.totalPrizeXlm,
        firstSeenLedger: entry.firstSeenLedger,
      })),
      nextCursor: hasMore && last ? this.encodeCursor(mode, last) : null,
    };
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
