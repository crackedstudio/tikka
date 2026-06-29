import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiSecurity } from "@nestjs/swagger";
import { CacheService } from "../../cache/cache.service";
import { UserEntity } from "../../database/entities/user.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { RaffleEntity } from "../../database/entities/raffle.entity";
import { ApiKeyGuard } from "../api-key.guard";
import {
  UserProfileDto,
  UserLeaderboardResponseDto,
  UserLeaderboardEntryDto,
} from "./dto/user.dto";
import {
  RaffleListItemDto,
  UserRaffleHistoryItemDto,
  UserRaffleHistoryResponseDto,
} from "./dto/raffle.dto";

export interface PaginationQuery {
  limit?: string;
  offset?: string;
}

@ApiTags('users')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller()
export class UsersController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * GET /leaderboard
   * Top users by total_raffles_won, then total_prize_xlm.
   * Declared before /:address to avoid route shadowing.
   */
  @ApiOperation({ summary: 'User leaderboard', description: 'Top users ordered by wins, then prize XLM.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, type: UserLeaderboardResponseDto })
  @Get("leaderboard")
  async leaderboard(@Query() query: PaginationQuery): Promise<UserLeaderboardResponseDto> {
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const offset = parseInt(query.offset ?? "0", 10);

    // Cache only the default first page
    if (limit === 20 && offset === 0) {
      const cached = await this.cacheService.getLeaderboard();
      if (cached) return cached;
    }

    const [users, total] = await this.userRepo
      .createQueryBuilder("u")
      .orderBy("u.totalRafflesWon", "DESC")
      .addOrderBy("u.totalPrizeXlm", "DESC")
      .addOrderBy("u.totalTicketsBought", "DESC")
      .limit(limit)
      .offset(offset)
      .getManyAndCount();

    const result: UserLeaderboardResponseDto = {
      data: users.map((u, i): UserLeaderboardEntryDto => ({
        rank: offset + i + 1,
        address: u.address,
        total_raffles_won: u.totalRafflesWon,
        total_prize_xlm: u.totalPrizeXlm,
        total_tickets_bought: u.totalTicketsBought,
        total_raffles_entered: u.totalRafflesEntered,
      })),
      total,
      limit,
      offset,
    };

    if (limit === 20 && offset === 0) {
      await this.cacheService.setLeaderboard(result);
    }

    return result;
  }

  /**
   * GET /users/:address
   * User profile — cache-first, PostgreSQL fallback.
   */
  @ApiOperation({ summary: 'Get user profile' })
  @ApiParam({ name: 'address', description: 'Stellar public key' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Get("users/:address")
  async profile(@Param("address") address: string): Promise<UserProfileDto> {
    const cached = await this.cacheService.getUserProfile(address);
    if (cached) return cached;

    const user = await this.userRepo.findOne({ where: { address } });
    if (!user) throw new NotFoundException(`User ${address} not found`);

    // Fetch creator stats
    const rafflesCreated = await this.raffleRepo.count({ where: { creator: address } });

    const totals = await this.raffleRepo
      .createQueryBuilder("r")
      .select("SUM(r.ticketsSold)", "totalTicketsSold")
      .addSelect("SUM(CAST(r.ticketsSold AS DECIMAL) * CAST(r.ticketPrice AS DECIMAL))", "totalRaised")
      .where("r.creator = :address", { address })
      .getRawOne();

    const participantCountResult = await this.ticketRepo
      .createQueryBuilder("t")
      .innerJoin("raffles", "r", "t.raffleId = r.id")
      .select("COUNT(DISTINCT t.owner)", "count")
      .where("r.creator = :address", { address })
      .getRawOne();

    const participantCount = parseInt(participantCountResult?.count ?? "0", 10);

    const winnerCountResult = await this.raffleRepo
      .createQueryBuilder("r")
      .select("COUNT(DISTINCT r.winner)", "count")
      .where("r.creator = :address AND r.winner IS NOT NULL", { address })
      .getRawOne();

    const winnerCount = parseInt(winnerCountResult?.count ?? "0", 10);

    const participantWinRate = participantCount > 0
      ? (winnerCount / participantCount) * 100
      : 0;

    const result: UserProfileDto = {
      address: user.address,
      total_tickets_bought: user.totalTicketsBought,
      total_raffles_entered: user.totalRafflesEntered,
      total_raffles_won: user.totalRafflesWon,
      total_prize_xlm: user.totalPrizeXlm,
      creator_stats: {
        raffles_created: rafflesCreated,
        total_tickets_sold: parseInt(totals?.totalTicketsSold ?? "0", 10),
        total_xlm_raised: totals?.totalRaised ?? "0",
        participant_win_rate: parseFloat(participantWinRate.toFixed(2)),
      }
    };

    await this.cacheService.setUserProfile(address, result);
    return result;
  }

  /**
   * GET /users/:address/history
   * Paginated list of raffles the user has participated in.
   */
  @ApiOperation({ summary: 'Get user raffle history' })
  @ApiParam({ name: 'address', description: 'Stellar public key' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, type: UserRaffleHistoryResponseDto })
  @Get("users/:address/history")
  async history(
    @Param("address") address: string,
    @Query() query: PaginationQuery,
  ): Promise<UserRaffleHistoryResponseDto> {
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const offset = parseInt(query.offset ?? "0", 10);

    // Get distinct raffle IDs for this user
    const ticketRows = await this.ticketRepo
      .createQueryBuilder("t")
      .select("DISTINCT t.raffleId", "raffleId")
      .where("t.owner = :address", { address })
      .getRawMany();

    const raffleIds: number[] = ticketRows.map((r) => Number(r.raffleId));

    if (raffleIds.length === 0) {
      return { data: [], total: 0, limit, offset };
    }

    const raffles = await this.raffleRepo
      .createQueryBuilder("r")
      .where("r.id IN (:...ids)", { ids: raffleIds })
      .orderBy("r.createdAt", "DESC")
      .limit(limit)
      .offset(offset)
      .getMany();

    // Per-raffle ticket count for this user
    const ticketCounts = await this.ticketRepo
      .createQueryBuilder("t")
      .select("t.raffleId", "raffleId")
      .addSelect("COUNT(*)", "count")
      .where("t.owner = :address AND t.raffleId IN (:...ids)", {
        address,
        ids: raffleIds,
      })
      .groupBy("t.raffleId")
      .getRawMany();

    const countMap = new Map<number, number>(
      ticketCounts.map((r) => [Number(r.raffleId), Number(r.count)]),
    );

    const result: UserRaffleHistoryResponseDto = {
      data: raffles.map((r): UserRaffleHistoryItemDto => ({
        id: r.id,
        creator: r.creator,
        status: r.status,
        ticket_price: r.ticketPrice,
        asset: r.asset,
        max_tickets: r.maxTickets,
        tickets_sold: r.ticketsSold,
        end_time: r.endTime,
        winner: r.winner,
        prize_amount: r.prizeAmount,
        metadata_cid: r.metadataCid,
        created_at: r.createdAt.toISOString(),
        user_tickets: countMap.get(r.id) ?? 0,
        won: r.winner === address,
      })),
      total: raffleIds.length,
      limit,
      offset,
    };

    return result;
  }
}
