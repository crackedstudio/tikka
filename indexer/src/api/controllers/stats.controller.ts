import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformStatEntity } from '../../database/entities/platform-stat.entity';
import { CacheService } from '../../cache/cache.service';

@Controller('stats')
export class StatsController {
  constructor(
    @InjectRepository(PlatformStatEntity)
    private readonly statsRepo: Repository<PlatformStatEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Get('platform')
  async getPlatformStats() {
    return this.cacheService.wrap('stats:platform', 300, async () => {
      // Get the latest stats entry
      const stats = await this.statsRepo.findOne({
        where: {},
        order: { date: 'DESC' },
      });

      if (!stats) {
        return {
          total_raffles: 0,
          total_tickets: 0,
          total_volume_xlm: '0',
          unique_participants: 0,
          prizes_distributed_xlm: '0',
        };
      }

      return stats;
    });
  }
}
