import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import { ApiKeyGuard } from "../api-key.guard";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiSecurity } from "@nestjs/swagger";
import { CacheService } from "../../cache/cache.service";
import { RaffleEntity } from "../../database/entities/raffle.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import {
  RaffleListItemDto,
  RaffleDetailDto,
  RaffleListResponseDto,
} from "./dto/raffle.dto";
import {
  ParticipantDto,
  ParticipantListResponseDto,
} from "./dto/participant.dto";

export interface RaffleListQuery {
  status?: string;
  creator?: string;
  asset?: string;
  category?: string;
  limit?: string;
  offset?: string;
}

@ApiTags('raffles')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller("raffles")
export class RafflesController {
  constructor(
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * GET /raffles
   * List raffles with optional filters and pagination.
   * Uses cache for the active-raffle list; falls back to PostgreSQL.
   */
  @ApiOperation({ summary: 'List raffles', description: 'Returns a paginated list of raffles with optional filters.' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'drawing', 'finalized', 'cancelled'] })
  @ApiQuery({ name: 'creator', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, type: RaffleListResponseDto })
  @Get()
  async list(@Query() query: RaffleListQuery): Promise<RaffleListResponseDto> {
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const offset = parseInt(query.offset ?? "0", 10);

    // Serve from cache when querying active raffles with no other filters
    const isActiveOnlyQuery =
      (!query.status || query.status === "open") &&
      !query.creator &&
      !query.asset &&
      !query.category &&
      offset === 0 &&
      limit === 20;

    if (isActiveOnlyQuery) {
      const cached = await this.cacheService.getActiveRaffles();
      if (cached) return cached;
    }

    const qb = this.raffleRepo
      .createQueryBuilder("r")
      .orderBy("r.createdAt", "DESC")
      .limit(limit)
      .offset(offset);

    if (query.status) qb.andWhere("r.status = :status", { status: query.status });
    if (query.creator) qb.andWhere("r.creator = :creator", { creator: query.creator });
    if (query.asset) qb.andWhere("r.asset = :asset", { asset: query.asset });

    const [items, total] = await qb.getManyAndCount();

    const result = {
      data: items.map(this.formatRaffle),
      total,
      limit,
      offset,
    };

    if (isActiveOnlyQuery) {
      await this.cacheService.setActiveRaffles(result);
    }

    return result;
  }

  /**
   * GET /raffles/:id
   * Raffle detail — cache-first, PostgreSQL fallback.
   */
  @ApiOperation({ summary: 'Get raffle by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: RaffleDetailDto })
  @ApiResponse({ status: 404, description: 'Raffle not found' })
  @Get(":id")
  async detail(@Param("id", ParseIntPipe) id: number): Promise<RaffleDetailDto> {
    const cached = await this.cacheService.getRaffleDetail(String(id));
    if (cached) return cached;

    const raffle = await this.raffleRepo.findOne({ where: { id } });
    if (!raffle) throw new NotFoundException(`Raffle ${id} not found`);

    const ticketCount = await this.ticketRepo.count({ where: { raffleId: id } });

    const result: RaffleDetailDto = {
      id: raffle.id,
      creator: raffle.creator,
      status: raffle.status,
      ticket_price: raffle.ticketPrice,
      asset: raffle.asset,
      max_tickets: raffle.maxTickets,
      tickets_sold: raffle.ticketsSold,
      end_time: raffle.endTime,
      winner: raffle.winner,
      winning_ticket_id: raffle.winningTicketId,
      prize_amount: raffle.prizeAmount,
      metadata_cid: raffle.metadataCid,
      created_at: raffle.createdAt.toISOString(),
      ticket_count: ticketCount,
    };

    await this.cacheService.setRaffleDetail(String(id), result);
    return result;
  }

  /**
   * GET /raffles/:id/participants
   * List ticket holders for a raffle with pagination.
   * Aggregates tickets by owner to get tickets_count and first purchase time.
   */
  @ApiOperation({ summary: 'List participants for a raffle', description: 'Returns paginated list of ticket holders with ticket counts.' })
  @ApiParam({ name: 'id', type: Number, description: 'Raffle ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 100' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  @ApiResponse({ status: 200, type: ParticipantListResponseDto })
  @ApiResponse({ status: 404, description: 'Raffle not found' })
  @Get(":id/participants")
  async getParticipants(
    @Param("id", ParseIntPipe) id: number,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<ParticipantListResponseDto> {
    const raffle = await this.raffleRepo.findOne({ where: { id } });
    if (!raffle) throw new NotFoundException(`Raffle ${id} not found`);

    const parsedLimit = Math.min(parseInt(limit ?? "20", 10), 100);
    const parsedOffset = parseInt(offset ?? "0", 10);

    // Aggregate tickets by owner: count tickets and get MIN(purchased_at_ledger) as purchased_at
    const qb = this.ticketRepo
      .createQueryBuilder("t")
      .select("t.owner", "address")
      .addSelect("COUNT(*)", "tickets_count")
      .addSelect("MIN(t.purchasedAtLedger)", "purchased_at")
      .where("t.raffleId = :raffleId", { raffleId: id })
      .groupBy("t.owner")
      .orderBy("purchased_at", "ASC")
      .limit(parsedLimit)
      .offset(parsedOffset);

    const rawResults = await qb.getRawMany();

    // Get total count of unique participants
    const totalResult = await this.ticketRepo
      .createQueryBuilder("t")
      .select("COUNT(DISTINCT t.owner)", "total")
      .where("t.raffleId = :raffleId", { raffleId: id });
    const totalRow = await totalResult.getRawOne();
    const total = parseInt(totalRow?.total ?? "0", 10);

    const participants: ParticipantDto[] = rawResults.map((row: { address: string; tickets_count: string; purchased_at: string }) => ({
      address: row.address,
      tickets_count: parseInt(row.tickets_count, 10),
      purchased_at: parseInt(row.purchased_at, 10),
    }));

    return {
      participants,
      total,
      limit: parsedLimit,
      offset: parsedOffset,
    };
  }

  private formatRaffle(r: RaffleEntity): RaffleListItemDto {
    return {
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
    };
  }
}
