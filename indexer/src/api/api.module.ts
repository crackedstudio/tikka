import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RafflesController } from './controllers/raffles.controller';
import { UsersController } from './controllers/users.controller';
import { LeaderboardController } from './controllers/leaderboard.controller';
import { StatsController } from './controllers/stats.controller';
import { RaffleEntity } from '../database/entities/raffle.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { PlatformStatEntity } from '../database/entities/platform-stat.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RaffleEntity,
      UserEntity,
      TicketEntity,
      PlatformStatEntity,
    ]),
  ],
  controllers: [
    RafflesController,
    UsersController,
    LeaderboardController,
    StatsController,
  ],
})
export class ApiModule {}
