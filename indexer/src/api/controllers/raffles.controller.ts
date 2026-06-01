import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CacheService } from "../../cache/cache.service";
import { RaffleEntity } from "../../database/entities/raffle.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { ApiKeyGuard } from "../api-key.guard";
import {
  RaffleListItemDto,
  RaffleDetailDto,
  RaffleListResponseDto,
} from "./dto/raffle.dto";

export interface RaffleListQuery {
  status?: string;
  creator?: string;
  asset?: string;
  category?: string;
  limit?: string;
  offset?: string;
}

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
