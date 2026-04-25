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
import { CacheService } from "../../cache/cache.service";
import { UserEntity } from "../../database/entities/user.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { RaffleEntity } from "../../database/entities/raffle.entity";
import { ApiKeyGuard } from "../api-key.guard";

export interface PaginationQuery {
  limit?: string;
  offset?: string;
}

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
  @Get("leaderboard")
  async leaderboard(@Query() query: PaginationQuery) {
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

    const result = {
      data: users.map((u, i) => ({
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
  @Get("users/:address")
  async profile(@Param("address") address: string) {
    const cached = await this.cacheService.getUserProfile(address);
    if (cached) return cached;

    const user = await this.userRepo.findOne({ where: { address } });
    if (!user) throw new NotFoundException(`User ${address} not found`);

    const result = {
      address: user.address,
      total_tickets_bought: user.totalTicketsBought,
      total_raffles_entered: user.totalRafflesEntered,
      total_raffles_won: user.totalRafflesWon,
      total_prize_xlm: user.totalPrizeXlm,
      first_seen_ledger: user.firstSeenLedger,
      updated_at: user.updatedAt,
    };

    await this.cacheService.setUserProfile(address, result);
    return result;
  }

  /**
   * GET /users/:address/history
   * Paginated list of raffles the user has participated in.
   */
  @Get("users/:address/history")
  async history(
    @Param("address") address: string,
    @Query() query: PaginationQuery,
  ) {
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

    return {
      data: raffles.map((r) => ({
        id: r.id,
        status: r.status,
        ticket_price: r.ticketPrice,
        asset: r.asset,
        max_tickets: r.maxTickets,
        tickets_sold: r.ticketsSold,
        end_time: r.endTime,
        winner: r.winner,
        prize_amount: r.prizeAmount,
        created_at: r.createdAt,
        user_tickets: countMap.get(r.id) ?? 0,
        won: r.winner === address,
      })),
      total: raffleIds.length,
      limit,
      offset,
    };
  }
}
