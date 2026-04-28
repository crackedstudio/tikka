
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, seconds } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RafflesModule } from "./api/rest/raffles/raffles.module";
import { UsersModule } from "./api/rest/users/users.module";
import { LeaderboardModule } from "./api/rest/leaderboard/leaderboard.module";
import { StatsModule } from "./api/rest/stats/stats.module";
import { NotificationsModule } from "./api/rest/notifications/notifications.module";
import { SearchModule } from "./api/rest/search/search.module";
import { SupportModule } from "./api/rest/support/support.module";
import { HealthModule } from "./health/health.module";
import { MonitorModule } from "./api/rest/monitor/monitor.module";
import { SupabaseModule } from "./services/supabase.module";
import { GeoModule } from "./services/geo.module";
import { GeoMiddleware } from "./middleware/geo.middleware";
import { TikkaThrottlerGuard } from "./middleware/throttler.guard";
import { validate } from "./config/env.schema";
import { IndexerBackfillModule } from "./services/indexer-backfill.module";
import { MaintenanceModeGuard } from "./maintenance/maintenance-mode.guard";
import { MaintenanceModeModule } from "./maintenance/maintenance-mode.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>("NODE_ENV", "development");
        const isProd = nodeEnv === "production";

        return {
          pinoHttp: {
            level: config.get<string>("LOG_LEVEL", isProd ? "info" : "debug"),
            transport: isProd
              ? undefined
              : {
                  target: "pino-pretty",
                  options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    singleLine: true,
                  },
                },
            redact: [
              "req.headers.authorization",
              "req.headers.x-admin-token",
            ],
          },
        };
      },
    }),

    /**
     * Named throttler tiers — each applied by the TikkaThrottlerGuard.
     *
     * Tier          Limit      Window    Applies to
     * ──────────────────────────────────────────────────────────────
     * default       100 req    60 s      All public endpoints
     * auth            5 req    60 s      POST /auth/verify
     * nonce           5 req    60 s      GET  /auth/nonce
     *
     * The auth and nonce tiers are overridden at the controller level
     * via @Throttle() — the values here serve as the fallback defaults
     * and can be tuned via env vars without a redeploy.
     *
     * Override limits via env vars (see .env.example):
     *   THROTTLE_DEFAULT_LIMIT / THROTTLE_DEFAULT_TTL
     *   THROTTLE_AUTH_LIMIT    / THROTTLE_AUTH_TTL
     *   THROTTLE_NONCE_LIMIT   / THROTTLE_NONCE_TTL
     */
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule.forRoot()],
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
            limit: config.get<number>("THROTTLE_AUTH_LIMIT", 5),
            ttl: seconds(config.get<number>("THROTTLE_AUTH_TTL", 60)),
          },
          {
            name: "nonce",
            limit: config.get<number>("THROTTLE_NONCE_LIMIT", 5),
            ttl: seconds(config.get<number>("THROTTLE_NONCE_TTL", 60)),
          },
        ],
      }),
    }),

    SupabaseModule,
    GeoModule,
    AuthModule,
    RafflesModule,
    UsersModule,
    LeaderboardModule,
    StatsModule,
    NotificationsModule,
    SearchModule,
    SupportModule,
    HealthModule,
    MonitorModule,
    IndexerBackfillModule,
    MaintenanceModeModule,
  ],
  providers: [
    // 1. Maintenance guard first — blocks requests when MAINTENANCE_MODE is enabled
    { provide: APP_GUARD, useClass: MaintenanceModeGuard },
    // 2. JWT guard second — authenticates the request (sets req.user)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 3. Throttler guard third — rate limits by IP across all named tiers
    { provide: APP_GUARD, useClass: TikkaThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GeoMiddleware).forRoutes('*');
  }
}
