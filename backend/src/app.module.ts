import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, seconds } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RafflesModule } from "./api/rest/raffles/raffles.module";
import { UsersModule } from "./api/rest/users/users.module";
import { LeaderboardModule } from "./api/rest/leaderboard/leaderboard.module";
import { StatsModule } from "./api/rest/stats/stats.module";
import { NotificationsModule } from "./api/rest/notifications/notifications.module";
import { HealthModule } from "./health/health.module";
import { TikkaThrottlerGuard } from "./middleware/throttler.guard";
import { validate } from "./config/env.schema";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),

    /**
     * Named throttler tiers — each applied by the TikkaThrottlerGuard.
     *
     * Tier          Limit      Window    Applies to
     * ──────────────────────────────────────────────────────────────
     * default       100 req    60 s      All public endpoints
     * auth          10  req    60 s      POST /auth/verify
     * nonce         30  req    60 s      GET  /auth/nonce
     *
     * Override limits via env vars (see .env.example):
     *   THROTTLE_DEFAULT_LIMIT / THROTTLE_DEFAULT_TTL
     *   THROTTLE_AUTH_LIMIT    / THROTTLE_AUTH_TTL
     *   THROTTLE_NONCE_LIMIT   / THROTTLE_NONCE_TTL
     */
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: "default",
            limit: config.get<number>("THROTTLE_DEFAULT_LIMIT", 100),
            ttl: seconds(config.get<number>("THROTTLE_DEFAULT_TTL", 60)),
          },
          {
            name: "auth",
            limit: config.get<number>("THROTTLE_AUTH_LIMIT", 10),
            ttl: seconds(config.get<number>("THROTTLE_AUTH_TTL", 60)),
          },
          {
            name: "nonce",
            limit: config.get<number>("THROTTLE_NONCE_LIMIT", 30),
            ttl: seconds(config.get<number>("THROTTLE_NONCE_TTL", 60)),
          },
        ],
      }),
    }),

    AuthModule,
    RafflesModule,
    UsersModule,
    LeaderboardModule,
    StatsModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    // 1. JWT guard first — authenticates the request (sets req.user)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 2. Throttler guard second — rate limits by IP across all named tiers
    { provide: APP_GUARD, useClass: TikkaThrottlerGuard },
  ],
})
export class AppModule {}
