import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private redis: any;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    // @ts-ignore
    this.redis = new Redis.default({
      host,
      port,
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
  
  private readonly TTLS = {
    ACTIVE_RAFFLES: 30,
    RAFFLE_DETAIL: 10,
    LEADERBOARD: 60,
    USER_PROFILE: 30,
    PLATFORM_STATS: 300,
  };

  
  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
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
}
