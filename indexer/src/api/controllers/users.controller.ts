import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { TicketEntity } from '../../database/entities/ticket.entity';
import { CacheService } from '../../cache/cache.service';

@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly cacheService: CacheService,
  ) {}

  @Get(':address')
  async getUser(@Param('address') address: string) {
    return this.cacheService.wrap(`user:${address}`, 30, async () => {
      const user = await this.userRepo.findOne({ where: { address } });
      if (!user) throw new NotFoundException(`User ${address} not found`);
      return user;
    });
  }

  @Get(':address/history')
  async getUserHistory(
    @Param('address') address: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    // History is usually not cached as it's personalized and paginated,
    // but the user profile itself is cached.
    const [items, total] = await this.ticketRepo.findAndCount({
      where: { owner: address },
      relations: ['raffle'],
      order: { purchasedAtLedger: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      items: items.map(t => ({
        raffle_id: t.raffleId,
        status: t.raffle?.status,
        tickets_bought: 1, // This is per-ticket entry
        purchased_at_ledger: t.purchasedAtLedger,
        purchase_tx_hash: t.purchaseTxHash,
        prize_amount: t.raffle?.prizeAmount,
        is_winner: t.raffle?.winner === address,
      })),
      total,
    };
  }
}
