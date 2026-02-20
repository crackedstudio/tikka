import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RafflesModule } from './api/rest/raffles/raffles.module';
import { UsersModule } from './api/rest/users/users.module';
import { LeaderboardModule } from './api/rest/leaderboard/leaderboard.module';
import { StatsModule } from './api/rest/stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RafflesModule,
    UsersModule,
    LeaderboardModule,
    StatsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
