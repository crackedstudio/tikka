import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

type CacheBucket = 'raffles' | 'users' | 'others';

type CacheStats = {
  hits: number;
  misses: number;
  requests: number;
};

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: any;

  private readonly MEM_WARN_THRESHOLD = 80;
  private readonly MEM_CRIT_THRESHOLD = 90;
  private readonly MEM_MONITOR_INTERVAL_MS = 60_000;

  private cacheStats: Record<CacheBucket, CacheStats> = {
    raffles: { hits: 0, misses: 0, requests: 0 },
    users: { hits: 0, misses: 0, requests: 0 },
    others: { hits: 0, misses: 0, requests: 0 },
  };

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    // @ts-ignore
    this.redis = new Redis({
      host,
      port,
    });

    this.logger.log('Redis cache service initialized');

    setInterval(() => {
      this.monitorMemoryUsage().catch((error) => {
        this.logger.error('Redis memory monitoring failed', error.stack); 
      });
    }, this.MEM_MONITOR_INTERVAL_MS);
  }

  onModuleDestroy() {
    this.redis.disconnect();
    this.logger.log('Redis cache service disconnected');
  }

  /**
   * Ping Redis to verify connectivity. Used by health checks.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis ping error', error.stack);
      return false;
    }
  }

  /**
   * Returns round-trip latency in milliseconds, or null if Redis is unreachable.
   */
  async latency(): Promise<number | null> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return Date.now() - start;
    } catch {
      return null;
    }
  }

  private readonly TTLS = {
    ACTIVE_RAFFLES: 30,
    RAFFLE_DETAIL: 10,
    LEADERBOARD: 60,
    USER_PROFILE: 30,
    PLATFORM_STATS: 300,
  };

  private deriveBucket(key: string): CacheBucket {
    if (key.startsWith('raffle:') || key === 'raffle:active' || key === 'leaderboard') {
      return 'raffles';
    }
    if (key.startsWith('user:') || key.startsWith('stats:')) {
      return 'users';
    }
    return 'others';
  }

  private recordRequest(key: string, hit: boolean): void {
    const bucket = this.deriveBucket(key);
    const stats = this.cacheStats[bucket];

    stats.requests += 1;
    if (hit) {
      stats.hits += 1;
    } else {
      stats.misses += 1;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    const hit = Boolean(data);
    this.recordRequest(key, hit);

    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getActiveRaffles(): Promise<any | null> {
    return this.get('raffle:active');
  }

  async setActiveRaffles(raffles: any): Promise<void> {
    await this.set('raffle:active', raffles, this.TTLS.ACTIVE_RAFFLES);
  }

  async invalidateActiveRaffles(): Promise<void> {
    await this.del('raffle:active');
  }

  async getRaffleDetail(id: string): Promise<any | null> {
    return this.get(`raffle:${id}`);
  }

  async setRaffleDetail(id: string, detail: any): Promise<void> {
    await this.set(`raffle:${id}`, detail, this.TTLS.RAFFLE_DETAIL);
  }

  async invalidateRaffleDetail(id: string): Promise<void> {
    await this.del(`raffle:${id}`);
  }

  async getLeaderboard(): Promise<any | null> {
    return this.get('leaderboard');
  }

  async setLeaderboard(leaderboard: any): Promise<void> {
    await this.set('leaderboard', leaderboard, this.TTLS.LEADERBOARD);
  }

  async invalidateLeaderboard(): Promise<void> {
    await this.del('leaderboard');
  }

  async getUserProfile(address: string): Promise<any | null> {
    return this.get(`user:${address}`);
  }

  async setUserProfile(address: string, profile: any): Promise<void> {
    await this.set(`user:${address}`, profile, this.TTLS.USER_PROFILE);
  }

  async invalidateUserProfile(address: string): Promise<void> {
    await this.del(`user:${address}`);
  }

  async getPlatformStats(): Promise<any | null> {
    return this.get('stats:platform');
  }

  async setPlatformStats(stats: any): Promise<void> {
    await this.set('stats:platform', stats, this.TTLS.PLATFORM_STATS);
  }

  async invalidatePlatformStats(): Promise<void> {
    await this.del('stats:platform');
  }

  async getMemoryUsage(): Promise<{ usedMemory: number; maxMemory: number; usagePercent: number }> {
    const info = await this.redis.info('memory');
    const parsed = (info as string)
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith('#'))
      .reduce<Record<string, string>>((acc: Record<string, string>, line: string) => {
        const [k, v] = line.split(':');
        if (k && v) acc[k] = v;
        return acc;
      }, {});

    const usedMemory = Number(parsed.used_memory || '0');
    const maxMemory = Number(parsed.maxmemory || '0');
    const usagePercent = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;

    return { usedMemory, maxMemory, usagePercent };
  }

  async monitorMemoryUsage(): Promise<void> {
    const { usedMemory, maxMemory, usagePercent } = await this.getMemoryUsage();

    if (maxMemory === 0) {
      this.logger.warn('Redis maxmemory is currently 0 (unconfigured), set maxmemory in redis.conf');
      return;
    }

    if (usagePercent >= this.MEM_CRIT_THRESHOLD) {
      this.logger.error(
        `Redis memory CRITICAL: ${usedMemory} bytes used of ${maxMemory} bytes (${usagePercent.toFixed(2)}%)`
      );
    } else if (usagePercent >= this.MEM_WARN_THRESHOLD) {
      this.logger.warn(
        `Redis memory warning: ${usedMemory} bytes used of ${maxMemory} bytes (${usagePercent.toFixed(2)}%)`
      );
    } else {
      this.logger.debug(
        `Redis memory usage: ${usedMemory} bytes used of ${maxMemory} bytes (${usagePercent.toFixed(2)}%)`
      );
    }
  }

  getCacheStats(): Record<CacheBucket, CacheStats> {
    return JSON.parse(JSON.stringify(this.cacheStats));
  }

  getCacheHitRate(bucket: CacheBucket): number {
    const stats = this.cacheStats[bucket];
    if (stats.requests === 0) return 0;
    return (stats.hits / stats.requests) * 100;
  }

  getAllCacheHitRates(): Record<CacheBucket, number> {
    return {
      raffles: this.getCacheHitRate('raffles'),
      users: this.getCacheHitRate('users'),
      others: this.getCacheHitRate('others'),
    };
  }
}
