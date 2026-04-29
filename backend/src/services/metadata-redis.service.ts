import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Optional Redis client for raffle metadata cache-aside.
 * When REDIS_URL is unset or empty, all methods no-op and {@link isEnabled} is false.
 */
@Injectable()
export class MetadataRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetadataRedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL', '')?.trim();
    if (!url) {
      this.logger.log('REDIS_URL not set; metadata Redis cache disabled');
      return;
    }

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      this.client.on('error', (err: Error) => {
        this.logger.warn(`Redis client error: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Redis client failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      await this.client.setex(key, ttlSeconds, value);
    } catch {
      /* cache is best-effort */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      await this.client.del(key);
    } catch {
      /* best-effort */
    }
  }
}
