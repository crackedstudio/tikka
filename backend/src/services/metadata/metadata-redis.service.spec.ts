import Redis from 'ioredis';
import { MetadataRedisService } from './metadata-redis.service';

jest.mock('ioredis');

describe('MetadataRedisService', () => {
  const redisConstructor = jest.mocked(Redis);
  let client: {
    status: string;
    on: jest.Mock;
    connect: jest.Mock;
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    smembers: jest.Mock;
    quit: jest.Mock;
    disconnect: jest.Mock;
  };

  const createService = (url = 'redis://localhost:6379') =>
    new MetadataRedisService({ get: jest.fn().mockReturnValue(url) } as any);

  beforeEach(() => {
    client = {
      status: 'wait',
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    redisConstructor.mockImplementation(() => client as unknown as Redis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('disables the cache without a Redis URL', async () => {
    const service = createService('  ');
    service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
    expect(redisConstructor).not.toHaveBeenCalled();
    expect(await service.get('key')).toBeNull();
    await expect(service.setEx('key', 60, 'value')).resolves.toBeUndefined();
    await expect(service.del('key')).resolves.toBeUndefined();
  });

  it('connects lazily and reads, writes, and invalidates a cache entry', async () => {
    const service = createService();
    service.onModuleInit();
    client.get.mockResolvedValueOnce('cached');

    expect(redisConstructor).toHaveBeenCalledWith('redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    expect(await service.get('raffle:1')).toBe('cached');
    expect(client.connect).toHaveBeenCalledTimes(1);

    client.status = 'ready';
    await service.setEx('raffle:1', 120, 'new');
    await service.del('raffle:1');
    expect(client.setex).toHaveBeenCalledWith('raffle:1', 120, 'new');
    expect(client.del).toHaveBeenCalledWith('raffle:1');
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('treats Redis read and write failures as cache misses, not request failures', async () => {
    const service = createService();
    service.onModuleInit();
    client.connect.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.get('raffle:1')).resolves.toBeNull();
    await expect(service.setEx('raffle:1', 60, 'value')).resolves.toBeUndefined();
    await expect(service.del('raffle:1')).resolves.toBeUndefined();
    await expect(service.sMembers('index')).resolves.toEqual([]);
  });

  it('disconnects if graceful shutdown fails', async () => {
    const service = createService();
    service.onModuleInit();
    client.quit.mockRejectedValue(new Error('connection lost'));

    await service.onModuleDestroy();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(service.isEnabled()).toBe(false);
  });
});
