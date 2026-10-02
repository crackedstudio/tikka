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
import { Logger } from "@nestjs/common";
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
import { RaffleListQueryDto, ParticipantQueryDto } from "./dto/query.dto";
import { PaginationQueryGuard } from "../../database/pagination-query-guard";

@ApiTags('raffles')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller("raffles")
export class RafflesController {
  private readonly logger = new Logger(RafflesController.name);
  private readonly paginationGuard = new PaginationQueryGuard({
    warnDeepPageThreshold: 10000,
    softTimeoutMs: 5000,
    hardTimeoutMs: 30000,
  });

  constructor(
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Encode a raffle into an opaque cursor token for stable pagination.
   * 
   * Cursor encodes the deterministic sort key: [createdAt, id]
   * This ensures that even if rows are inserted mid-scan, the cursor
   * positions us correctly on the next logical row in the ORDER BY sequence.
   * 
   * Format: Base64(JSON{v: [createdAt ISO, id], a: id})
   * The 'a' field is redundant but kept for consistency with leaderboard cursors.
   */
  private encodeCursor(raffle: RaffleEntity): string {
    return Buffer.from(
      JSON.stringify({
        v: [raffle.createdAt.toISOString(), String(raffle.id)],
        a: String(raffle.id),
      }),
      'utf8',
    ).toString('base64');
  }

  /**
   * Decode an opaque cursor token back into sort values.
   * Returns null if cursor is malformed.
   */
  private decodeCursor(cursor: string): { values: string[]; id: string } | null {
    try {
      const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        v?: string[];
        a?: string;
      };

      if (!Array.isArray(payload.v) || payload.v.length !== 2 || !payload.a) {
        return null;
      }

      return { values: payload.v, id: payload.a };
    } catch {
      return null;
    }
  }

  /**
   * GET /raffles
   * List raffles with optional filters and pagination.
   * 
   * PAGINATION STRATEGY:
   * - If cursor is provided: Use keyset (cursor-based) pagination via createdAt DESC, id ASC
   * - Else if offset > 0: Use offset pagination (less stable, but acceptable for small offsets)
   * - Else: Fetch from cache (if no filters, offset=0, limit=20, status matches)
   * 
   * PERFORMANCE GUARDS:
   * - Offset pagination deeper than 10,000 rows triggers a warning and recommends cursor
   * - PostgreSQL statement_timeout (default 30s) prevents runaway queries
   * - Slow queries (>5s estimated) are logged with details
   * 
   * This ensures that:
   * 1. Active-raffle queries (defaults, no filters) are cached
   * 2. Deep pagination uses cursors to avoid offset drift
   * 3. Shallow pagination can still use offsets
   * 4. Long-running queries are detected and logged
   */
  @ApiOperation({ summary: 'List raffles', description: 'Returns a paginated list of raffles with optional filters.' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'drawing', 'finalized', 'cancelled'] })
  @ApiQuery({ name: 'creator', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor for stable pagination' })
  @ApiResponse({ status: 200, type: RaffleListResponseDto })
  @Get()
  async list(@Query() query: RaffleListQueryDto): Promise<RaffleListResponseDto> {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const startTime = performance.now();

    // Guard against deep-page offset pagination
    if (!query.cursor && offset > 0) {
      this.paginationGuard.guardOffsetPagination(offset, limit, 'GET /raffles');
    } else if (query.cursor) {
      this.paginationGuard.guardCursorPagination('GET /raffles');
    }

    // Serve from cache when querying active raffles with no other filters
    const isActiveOnlyQuery =
      (!query.status || query.status === "open") &&
      !query.creator &&
      !query.asset &&
      !query.category &&
      !query.cursor &&
      offset === 0 &&
      limit === 20;

    if (isActiveOnlyQuery) {
      const cached = await this.cacheService.getActiveRaffles();
      if (cached) return cached;
    }

    const qb = this.raffleRepo
      .createQueryBuilder("r")
      .orderBy("r.createdAt", "DESC")
      .addOrderBy("r.id", "ASC")
      .limit(limit + 1); // Fetch one extra to detect hasMore

    // Apply filters
    if (query.status) qb.andWhere("r.status = :status", { status: query.status });
    if (query.creator) qb.andWhere("r.creator = :creator", { creator: query.creator });
    if (query.asset) qb.andWhere("r.asset = :asset", { asset: query.asset });
    if (query.category) qb.andWhere("r.category = :category", { category: query.category });

    // Apply cursor or offset-based pagination
    if (query.cursor) {
      const decoded = this.decodeCursor(query.cursor);
      if (decoded) {
        // Keyset pagination: skip to rows that come AFTER the cursor in DESC order
        // For createdAt DESC: we want rows where createdAt < cursor value
        // For ties (createdAt =): we want rows where id > cursor id (ASC tiebreaker)
        qb.andWhere(
          `(
            r.createdAt < :v0
            OR (r.createdAt = :v0 AND r.id > :v1)
          )`,
          {
            v0: decoded.values[0], // createdAt ISO string
            v1: Number(decoded.values[1]), // id
          },
        );
      }
    } else if (offset > 0) {
      qb.offset(offset);
    }

    const items = await qb.getMany();
    const executionTimeMs = performance.now() - startTime;

    // Log slow queries
    if (executionTimeMs > 1000) {
      this.logger.warn(
        `Slow raffle list query: ${executionTimeMs.toFixed(0)}ms ` +
        `(status=${query.status}, offset=${offset}, limit=${limit}, cursor=${ query.cursor ? '<set>' : 'none'})`,
      );
    }

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const last = data.length > 0 ? data[data.length - 1] : undefined;

    // Determine effective offset for response
    // - null if cursor-paginated (cursor doesn't map to numeric offset)
    // - otherwise the provided offset
    const effectiveOffset = query.cursor ? null : offset;

    const result = {
      data: data.map(this.formatRaffle),
      total: -1, // Total is expensive to compute with cursor; omit for cursor queries
      limit,
      offset: effectiveOffset,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
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
    @Query() query: ParticipantQueryDto,
  ): Promise<ParticipantListResponseDto> {
    const raffle = await this.raffleRepo.findOne({ where: { id } });
    if (!raffle) throw new NotFoundException(`Raffle ${id} not found`);

    const parsedLimit = Math.min(query.limit ?? 20, 100);
    const parsedOffset = query.offset ?? 0;

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
