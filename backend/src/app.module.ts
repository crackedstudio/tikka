import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RafflesModule } from './api/rest/raffles/raffles.module';
import { UsersModule } from './api/rest/users/users.module';
import { LeaderboardModule } from './api/rest/leaderboard/leaderboard.module';
import { StatsModule } from './api/rest/stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    RafflesModule,
    UsersModule,
    LeaderboardModule,
    StatsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
