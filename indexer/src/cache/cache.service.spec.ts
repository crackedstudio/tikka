import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { ConfigService } from '@nestjs/config';
import { CacheKeys } from './cache.keys';
import { CacheInvalidations } from './cache.invalidations';
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

  it('should handle user profile', async () => {
    const address = 'GUSER';
    await service.setUserProfile(address, { wins: 2 });
    let profile = await service.getUserProfile(address);
    expect(profile.wins).toBe(2);

    await service.invalidateUserProfile(address);
    profile = await service.getUserProfile(address);
    expect(profile).toBeNull();
  });

  it('should handle platform stats', async () => {
    await service.setPlatformStats({ totalRaffles: 100 });
    let stats = await service.getPlatformStats();
    expect(stats.totalRaffles).toBe(100);

    await service.invalidatePlatformStats();
    stats = await service.getPlatformStats();
    expect(stats).toBeNull();
  });

  // --- CacheKeys unit tests ---

  describe('CacheKeys', () => {
    it('generates correct static keys', () => {
      expect(CacheKeys.raffle.active()).toBe('raffle:active');
      expect(CacheKeys.leaderboard.global()).toBe('leaderboard');
      expect(CacheKeys.stats.platform()).toBe('stats:platform');
    });

    it('generates correct dynamic keys', () => {
      expect(CacheKeys.raffle.detail('abc')).toBe('raffle:abc');
      expect(CacheKeys.user.profile('GADDR')).toBe('user:GADDR');
    });

    it('generates distinct keys for different ids', () => {
      expect(CacheKeys.raffle.detail('r1')).not.toBe(CacheKeys.raffle.detail('r2'));
      expect(CacheKeys.user.profile('A')).not.toBe(CacheKeys.user.profile('B'));
    });
  });

  // --- CacheInvalidations tests ---

  describe('CacheInvalidations.onPurchase', () => {
    it('invalidates raffle detail, active list, leaderboard, and buyer profile', async () => {
      const raffleId = 'raffle1';
      const buyer = 'GBUYER';

      await service.setRaffleDetail(raffleId, { seats: 10 });
      await service.setActiveRaffles([{ id: raffleId }]);
      await service.setLeaderboard([{ address: buyer }]);
      await service.setUserProfile(buyer, { wins: 0 });

      await CacheInvalidations.onPurchase(service, raffleId, buyer);

      expect(await service.getRaffleDetail(raffleId)).toBeNull();
      expect(await service.getActiveRaffles()).toBeNull();
      expect(await service.getLeaderboard()).toBeNull();
      expect(await service.getUserProfile(buyer)).toBeNull();
    });

    it('does not throw when keys are missing', async () => {
      await expect(
        CacheInvalidations.onPurchase(service, 'nonexistent', 'GNOBODY'),
      ).resolves.not.toThrow();
    });

    it('does not throw on repeated calls', async () => {
      await CacheInvalidations.onPurchase(service, 'r1', 'GADDR');
      await expect(
        CacheInvalidations.onPurchase(service, 'r1', 'GADDR'),
      ).resolves.not.toThrow();
    });
  });

  describe('CacheInvalidations.onFinalize', () => {
    it('invalidates raffle detail, active list, leaderboard, platform stats, and winner profile', async () => {
      const raffleId = 'raffle2';
      const winner = 'GWINNER';

      await service.setRaffleDetail(raffleId, { seats: 5 });
      await service.setActiveRaffles([{ id: raffleId }]);
      await service.setLeaderboard([{ address: winner, wins: 1 }]);
      await service.setPlatformStats({ totalRaffles: 42 });
      await service.setUserProfile(winner, { wins: 1 });

      await CacheInvalidations.onFinalize(service, raffleId, winner);

      expect(await service.getRaffleDetail(raffleId)).toBeNull();
      expect(await service.getActiveRaffles()).toBeNull();
      expect(await service.getLeaderboard()).toBeNull();
      expect(await service.getPlatformStats()).toBeNull();
      expect(await service.getUserProfile(winner)).toBeNull();
    });

    it('does not throw when keys are missing', async () => {
      await expect(
        CacheInvalidations.onFinalize(service, 'nonexistent', 'GNOBODY'),
      ).resolves.not.toThrow();
    });

    it('does not throw on repeated calls', async () => {
      await CacheInvalidations.onFinalize(service, 'r2', 'GADDR');
      await expect(
        CacheInvalidations.onFinalize(service, 'r2', 'GADDR'),
      ).resolves.not.toThrow();
    });
  });
});
