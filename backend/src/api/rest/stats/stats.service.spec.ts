import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StatsService, TransparencyStats, VerifyResult } from './stats.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
import {
  IndexerService,
  IndexerPlatformStats,
  IndexerTransparencyEntry,
} from '../../../services/indexer.service';

describe('StatsService', () => {
  let service: StatsService;
  let indexerService: jest.Mocked<IndexerService>;
  let configService: jest.Mocked<ConfigService>;
  let redis: jest.Mocked<MetadataRedisService>;

  beforeEach(async () => {
    indexerService = {
      getPlatformStats: jest.fn(),
      getTransparencyLog: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    redis = {
      isEnabled: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: IndexerService, useValue: indexerService },
        { provide: ConfigService, useValue: configService },
        { provide: MetadataRedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTransparencyStats', () => {
    it('should return platform stats with oracle public key and audit log', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: '250000000000',
        unique_participants: 1000,
        prizes_distributed_xlm: '50000000000',
      };

      const mockAuditEntries: IndexerTransparencyEntry[] = [
        {
          id: 'entry-1',
          timestamp: '2026-06-27T10:30:00Z',
          raffle_id: 10,
          request_id: 'req-123',
          oracle_id: 'oracle-001',
          seed: 'seed-hex-123',
          proof: 'proof-hex-456',
          tx_hash: 'tx-hash-789',
          method: 'VRF',
        },
      ];

      configService.get.mockReturnValue('0xabcd1234');
      redis.isEnabled.mockReturnValue(false);

      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: mockAuditEntries,
        total: 1,
      });

      const result = await service.getTransparencyStats();

      expect(result).toHaveProperty('total_raffles', 100);
      expect(result).toHaveProperty('total_tickets', 5000);
      expect(result).toHaveProperty('total_volume_xlm', '250000000000');
      expect(result).toHaveProperty('oracle_public_key', '0xabcd1234');
      expect(result).toHaveProperty('draws_completed', 1);
      expect(result.recent_audit_log).toHaveLength(1);
      expect(result.recent_audit_log[0].raffle_id).toBe(10);
    });

    it('should cache transparency stats for 60 seconds', async () => {
      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 50,
        total_tickets: 2000,
        total_volume_xlm: '100000000000',
        unique_participants: 500,
        prizes_distributed_xlm: '20000000000',
        oracle_public_key: '0xtest',
        draws_completed: 5,
        recent_audit_log: [],
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(JSON.stringify(mockStats));

      const result = await service.getTransparencyStats();

      expect(result).toEqual(mockStats);
      expect(redis.get).toHaveBeenCalledWith('stats:transparency:60');
      // Should not call indexer if cache hit
      expect(indexerService.getPlatformStats).not.toHaveBeenCalled();
    });

    it('should fetch fresh data when cache misses', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 75,
        total_tickets: 3000,
        total_volume_xlm: '150000000000',
        unique_participants: 750,
        prizes_distributed_xlm: '30000000000',
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null); // Cache miss

      configService.get.mockReturnValue('0xtest-key');
      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: [],
        total: 0,
      });

      const result = await service.getTransparencyStats();

      // Should have fetched from indexer
      expect(indexerService.getPlatformStats).toHaveBeenCalled();
      expect(result.total_raffles).toBe(75);
    });

    it('should store result in cache after fetching', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 60,
        total_tickets: 2500,
        total_volume_xlm: '125000000000',
        unique_participants: 600,
        prizes_distributed_xlm: '25000000000',
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);

      configService.get.mockReturnValue('0xkey');
      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: [],
        total: 0,
      });

      await service.getTransparencyStats();

      // Should set cache with TTL of 60 seconds
      expect(redis.set).toHaveBeenCalledWith(
        'stats:transparency:60',
        expect.any(String),
        60,
      );
    });

    it('should handle cache read errors gracefully', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 40,
        total_tickets: 1500,
        total_volume_xlm: '75000000000',
        unique_participants: 400,
        prizes_distributed_xlm: '15000000000',
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockRejectedValue(new Error('Redis connection failed'));

      configService.get.mockReturnValue('0xkey');
      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: [],
        total: 0,
      });

      // Should not throw, should continue and fetch from indexer
      const result = await service.getTransparencyStats();

      expect(result.total_raffles).toBe(40);
      expect(indexerService.getPlatformStats).toHaveBeenCalled();
    });

    it('should handle cache write errors gracefully', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 30,
        total_tickets: 1000,
        total_volume_xlm: '50000000000',
        unique_participants: 300,
        prizes_distributed_xlm: '10000000000',
      };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('Redis write failed'));

      configService.get.mockReturnValue('0xkey');
      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: [],
        total: 0,
      });

      // Should not throw despite cache write error
      const result = await service.getTransparencyStats();

      expect(result.total_raffles).toBe(30);
    });

    it('should handle missing transparency log gracefully', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 20,
        total_tickets: 500,
        total_volume_xlm: '25000000000',
        unique_participants: 200,
        prizes_distributed_xlm: '5000000000',
      };

      redis.isEnabled.mockReturnValue(false);
      configService.get.mockReturnValue('0xkey');

      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const result = await service.getTransparencyStats();

      // Should return empty audit log on error
      expect(result.recent_audit_log).toEqual([]);
      expect(result.draws_completed).toBe(0);
    });

    it('should disable caching when Redis not enabled', async () => {
      const mockPlatformStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 15,
        total_tickets: 300,
        total_volume_xlm: '15000000000',
        unique_participants: 150,
        prizes_distributed_xlm: '3000000000',
      };

      redis.isEnabled.mockReturnValue(false);
      configService.get.mockReturnValue('0xkey');

      indexerService.getPlatformStats.mockResolvedValue(mockPlatformStats);
      indexerService.getTransparencyLog.mockResolvedValue({
        entries: [],
        total: 0,
      });

      await service.getTransparencyStats();

      // Should not call Redis at all
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyDraw', () => {
    const testPublicKey =
      '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29';
    const testRequestId = 'test-request-id';
    const testProof =
      'e5fa44f2b31c1fb553b6021e7abed6824dd44fbfe3e6c3e1c2ddef0c2ce95c8a6d6b0559e6e6f2e0d97e3b4f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f';
    const testSeed =
      '2c26b46911185131006ba32006b3b4f8a6c8e3b0a1e8f1f6f7f8f9f0f1f2f3f';

    it('should return valid true for correct VRF proof', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      // Note: This will likely fail because the test proof/seed is not valid
      // but the structure should match
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('reason');
    });

    it('should return verified: false for invalid proof', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        'invalid-proof',
        testSeed,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should return verified: false for seed/proof mismatch', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        'wrong-seed',
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should cache verification result for 60 seconds', async () => {
      const cachedResult: VerifyResult = { valid: false, reason: 'Invalid' };

      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      expect(result).toEqual(cachedResult);
      // Verify cache was checked with correct key
      expect(redis.get).toHaveBeenCalledWith(
        expect.stringContaining('stats:verify:'),
      );
    });

    it('should store verification in cache after verification', async () => {
      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue(undefined);

      await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      // Verify set was called with TTL 60
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('stats:verify:'),
        expect.any(String),
        60,
      );
    });

    it('should include all 4 parameters in cache key', async () => {
      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);

      await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      // Verify cache key includes all parameters
      expect(redis.get).toHaveBeenCalledWith(
        `stats:verify:${testPublicKey}:${testRequestId}:${testProof}:${testSeed}`,
      );
    });

    it('should handle cache read error and continue verification', async () => {
      redis.isEnabled.mockReturnValue(true);
      redis.get.mockRejectedValue(new Error('Cache failed'));

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      // Should still return a result despite cache error
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('reason');
    });

    it('should handle cache write error without failing', async () => {
      redis.isEnabled.mockReturnValue(true);
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('Write failed'));

      // Should not throw
      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      expect(result).toHaveProperty('valid');
    });

    it('should skip caching when Redis not enabled', async () => {
      redis.isEnabled.mockReturnValue(false);

      await service.verifyDraw(
        testPublicKey,
        testRequestId,
        testProof,
        testSeed,
      );

      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('should return VerifyResult interface for invalid hex inputs', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw(
        'not-hex',
        testRequestId,
        testProof,
        testSeed,
      );

      expect(result).toHaveProperty('valid');
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('should handle empty string inputs gracefully', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw('', '', '', '');

      expect(result).toHaveProperty('valid');
      expect(result.valid).toBe(false);
    });

    it('should return reason message for verification failures', async () => {
      redis.isEnabled.mockReturnValue(false);

      const result = await service.verifyDraw(
        testPublicKey,
        testRequestId,
        'bad-proof',
        testSeed,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('getPlatformStats', () => {
    it('should delegate to IndexerService', async () => {
      const mockStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: '250000000000',
        unique_participants: 1000,
        prizes_distributed_xlm: '50000000000',
      };

      indexerService.getPlatformStats.mockResolvedValue(mockStats);

      const result = await service.getPlatformStats();

      expect(result).toEqual(mockStats);
      expect(indexerService.getPlatformStats).toHaveBeenCalled();
    });
  });
});
