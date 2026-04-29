import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type IdempotencyState =
  | { status: 'in-flight' }
  | { status: 'done'; response: unknown };

const TTL_SECONDS = 24 * 60 * 60; // 24 hours

@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private key(walletAddress: string, idempotencyKey: string): string {
    return `idem:${walletAddress}:${idempotencyKey}`;
  }

  /**
   * Atomically mark a key as in-flight using SET NX.
   * Returns true if the lock was acquired (first request), false if already exists.
   */
  async lock(walletAddress: string, idempotencyKey: string): Promise<boolean> {
    const result = await this.redis.set(
      this.key(walletAddress, idempotencyKey),
      JSON.stringify({ status: 'in-flight' }),
      'EX',
      TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  /** Overwrite the key with the final response, resetting the TTL. */
  async resolve(
    walletAddress: string,
    idempotencyKey: string,
    response: unknown,
  ): Promise<void> {
    await this.redis.set(
      this.key(walletAddress, idempotencyKey),
      JSON.stringify({ status: 'done', response }),
      'EX',
      TTL_SECONDS,
    );
  }

  /** Returns the current state for a key, or null if it doesn't exist. */
  async get(
    walletAddress: string,
    idempotencyKey: string,
  ): Promise<IdempotencyState | null> {
    const raw = await this.redis.get(this.key(walletAddress, idempotencyKey));
    if (!raw) return null;
    return JSON.parse(raw) as IdempotencyState;
  }
}
