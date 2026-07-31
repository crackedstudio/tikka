import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IdempotencyService } from './idempotency.service';

const redisStore = new Map<string, { value: string; expiresAt: number }>();

const mockRedisInstance = {
  set: jest.fn(),
  get: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    redisStore.clear();
    jest.clearAllMocks();
    mockRedisInstance.set.mockImplementation((key: string, value: string, ...args: unknown[]) => {
      const hasNx = args.includes('NX');
      const ttlIndex = args.findIndex((arg) => arg === 'EX');
      const ttlSeconds = ttlIndex >= 0 ? Number(args[ttlIndex + 1]) : undefined;

      if (hasNx && redisStore.has(key)) {
        return null;
      }

      const expiresAt = ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : Infinity;
      redisStore.set(key, { value, expiresAt });
      return 'OK';
    });
    mockRedisInstance.get.mockImplementation((key: string) => {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    });
    mockRedisInstance.quit.mockResolvedValue('OK');

    const config = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;

    service = new IdempotencyService(config);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function runWithIdempotency(walletAddress: string, idempotencyKey: string, work: () => Promise<unknown>) {
    const existing = await service.get(walletAddress, idempotencyKey);
    if (existing?.status === 'done') {
      return existing.response;
    }

    const acquired = await service.lock(walletAddress, idempotencyKey);
    if (!acquired) {
      const state = await service.get(walletAddress, idempotencyKey);
      if (state?.status === 'done') {
        return state.response;
      }
      throw new Error('request already in flight');
    }

    const result = await work();
    await service.resolve(walletAddress, idempotencyKey, result);
    return result;
  }

  it('reuses the cached result for the same key and only executes the work once', async () => {
    const work = jest.fn(async () => ({ ok: true, txHash: 'abc123' }));

    const first = await runWithIdempotency('wallet-a', 'key-1', work);
    const second = await runWithIdempotency('wallet-a', 'key-1', work);

    expect(first).toEqual({ ok: true, txHash: 'abc123' });
    expect(second).toEqual({ ok: true, txHash: 'abc123' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('executes only once when two concurrent requests share the same key', async () => {
    const work = jest.fn(async () => ({ ok: true, txHash: 'concurrent' }));

    const [first, second] = await Promise.allSettled([
      runWithIdempotency('wallet-b', 'key-2', work),
      runWithIdempotency('wallet-b', 'key-2', work),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keeps different idempotency keys independent', async () => {
    const workA = jest.fn(async () => ({ outcome: 'a' }));
    const workB = jest.fn(async () => ({ outcome: 'b' }));

    const first = await runWithIdempotency('wallet-c', 'key-a', workA);
    const second = await runWithIdempotency('wallet-c', 'key-b', workB);

    expect(first).toEqual({ outcome: 'a' });
    expect(second).toEqual({ outcome: 'b' });
    expect(workA).toHaveBeenCalledTimes(1);
    expect(workB).toHaveBeenCalledTimes(1);
  });

  it('treats an expired key as absent', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    await service.lock('wallet-d', 'key-expired');
    await service.resolve('wallet-d', 'key-expired', { ok: true });

    jest.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    await expect(service.get('wallet-d', 'key-expired')).resolves.toBeNull();
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      'idem:wallet-d:key-expired',
      expect.any(String),
      'EX',
      86400,
    );
  });
});
