import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { ConfigService } from '@nestjs/config';
import RedisMock from 'ioredis-mock';

jest.mock('ioredis', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return new RedisMock();
    }),
  };
});

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => defaultValue),
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set and get values with TTL', async () => {
    const key = 'test:key';
    const val = { foo: 'bar' };
    await service.set(key, val, 10);
    const result = await service.get(key);
    expect(result).toEqual(val);
  });

  it('should invalidate active raffles', async () => {
    await service.setActiveRaffles([{ id: '1' }]);
    await service.invalidateActiveRaffles();
    const result = await service.getActiveRaffles();
    expect(result).toBeNull();
  });

  it('should handle raffle details', async () => {
    const id = 'raffle123';
    await service.setRaffleDetail(id, { name: 'Prize' });
    let detail = await service.getRaffleDetail(id);
    expect(detail.name).toBe('Prize');

    await service.invalidateRaffleDetail(id);
    detail = await service.getRaffleDetail(id);
    expect(detail).toBeNull();
  });

  it('should handle leaderboard', async () => {
    await service.setLeaderboard([{ address: 'G123', wins: 5 }]);
    let lb = await service.getLeaderboard();
    expect(lb[0].wins).toBe(5);

    await service.invalidateLeaderboard();
    lb = await service.getLeaderboard();
    expect(lb).toBeNull();
  });
});
