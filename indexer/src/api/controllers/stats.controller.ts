import { Controller, Get, UseGuards } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CacheService } from "../../cache/cache.service";
import { PlatformStatEntity } from "../../database/entities/platform-stat.entity";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { ApiKeyGuard } from "../api-key.guard";

@UseGuards(ApiKeyGuard)
@Controller("stats")
export class StatsController {
  constructor(
    @InjectRepository(PlatformStatEntity)
    private readonly statRepo: Repository<PlatformStatEntity>,
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * GET /stats/platform
   * Aggregated platform-wide stats — cache-first (5 min TTL), PostgreSQL fallback.
   * Merges the latest daily roll-up row with live counts for active raffles.
   */
  @Get("platform")
  async platform() {
    const cached = await this.cacheService.getPlatformStats();
    if (cached) return cached;

    // Latest daily roll-up
    const latest = await this.statRepo
      .createQueryBuilder("s")
      .orderBy("s.date", "DESC")
      .getOne();

    // Live counts that change frequently
    const [activeRaffles, totalUsers] = await Promise.all([
      this.raffleRepo.count({ where: { status: RaffleStatus.OPEN } }),
      this.userRepo.count(),
    ]);

    const result = {
      date: latest?.date ?? null,
      total_raffles: latest?.totalRaffles ?? 0,
      total_tickets: latest?.totalTickets ?? 0,
      total_volume_xlm: latest?.totalVolumeXlm ?? "0",
      unique_participants: latest?.uniqueParticipants ?? 0,
      prizes_distributed_xlm: latest?.prizesDistributedXlm ?? "0",
      active_raffles: activeRaffles,
      total_users: totalUsers,
    };

    await this.cacheService.setPlatformStats(result);
    return result;
  }
}
