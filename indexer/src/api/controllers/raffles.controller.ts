import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { CacheService } from '../../cache/cache.service';

@Controller('raffles')
export class RafflesController {
  constructor(
    @InjectRepository(RaffleEntity)
    private readonly raffleRepo: Repository<RaffleEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async listRaffles(
    @Query('status') status?: string,
    @Query('creator') creator?: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    // We only cache the "active" raffles list (status=OPEN) without complex filters
    const isDefaultActiveQuery = status === RaffleStatus.OPEN && !creator && limit === 20 && offset === 0;

    if (isDefaultActiveQuery) {
      return this.cacheService.wrap('raffle:active', 30, () => this.fetchRaffles(status, creator, limit, offset));
    }

    return this.fetchRaffles(status, creator, limit, offset);
  }

  @Get(':id')
  async getRaffle(@Param('id') id: number) {
    const raffle = await this.cacheService.wrap(`raffle:${id}`, 10, async () => {
      const r = await this.raffleRepo.findOne({ where: { id } });
      if (!r) throw new NotFoundException(`Raffle ${id} not found`);
      return r;
    });

    return raffle;
  }

  private async fetchRaffles(status?: string, creator?: string, limit: number = 20, offset: number = 0) {
    const query = this.raffleRepo.createQueryBuilder('raffle');

    if (status) {
      query.andWhere('raffle.status = :status', { status });
    }

    if (creator) {
      query.andWhere('raffle.creator = :creator', { creator });
    }

    query.orderBy('raffle.createdAt', 'DESC');
    query.take(limit);
    query.skip(offset);

    const [raffles, total] = await query.getManyAndCount();
    return { raffles, total };
  }
}
