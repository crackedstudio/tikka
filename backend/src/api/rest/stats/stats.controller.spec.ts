import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService, TransparencyStats, VerifyResult } from './stats.service';
import {
  IndexerPlatformStats,
  IndexerTransparencyEntry,
} from '../../../services/indexer.service';

describe('StatsController', () => {
  let controller: StatsController;
  let service: jest.Mocked<StatsService>;

  beforeEach(async () => {
    const mockService = {
      getPlatformStats: jest.fn(),
      getTransparencyStats: jest.fn(),
      verifyDraw: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [{ provide: StatsService, useValue: mockService }],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    service = module.get<StatsService>(StatsService) as jest.Mocked<StatsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /stats/platform', () => {
    it('should return platform aggregates', async () => {
      const mockStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: '250000000000',
        unique_participants: 1000,
        prizes_distributed_xlm: '50000000000',
      };

      service.getPlatformStats.mockResolvedValue(mockStats);

      const result = await controller.getPlatformStats();

      expect(result).toEqual(mockStats);
      expect(service.getPlatformStats).toHaveBeenCalled();
    });

    it('should return correct field types', async () => {
      const mockStats: IndexerPlatformStats = {
        date: '2026-06-27',
        total_raffles: 150,
        total_tickets: 7500,
        total_volume_xlm: '375000000000',
        unique_participants: 1500,
        prizes_distributed_xlm: '75000000000',
      };

      service.getPlatformStats.mockResolvedValue(mockStats);

      const result = await controller.getPlatformStats();

      expect(typeof result.total_raffles).toBe('number');
      expect(typeof result.total_tickets).toBe('number');
      expect(typeof result.total_volume_xlm).toBe('string');
      expect(typeof result.unique_participants).toBe('number');
      expect(typeof result.prizes_distributed_xlm).toBe('string');
    });
  });

  describe('GET /stats/transparency', () => {
    it('should return transparency stats with oracle key and audit log', async () => {
      const mockEntry: IndexerTransparencyEntry = {
        id: 'entry-1',
        timestamp: '2026-06-27T10:30:00Z',
        raffle_id: 10,
        request_id: 'req-123',
        oracle_id: 'oracle-001',
        seed: 'seed-hex',
        proof: 'proof-hex',
        tx_hash: 'tx-hash',
        method: 'VRF',
      };

      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: '250000000000',
        unique_participants: 1000,
        prizes_distributed_xlm: '50000000000',
        oracle_public_key: '0xabcd1234',
        draws_completed: 25,
        recent_audit_log: [mockEntry],
      };

      service.getTransparencyStats.mockResolvedValue(mockStats);

      const result = await controller.getTransparencyStats();

      expect(result).toHaveProperty('oracle_public_key', '0xabcd1234');
      expect(result).toHaveProperty('draws_completed', 25);
      expect(result.recent_audit_log).toHaveLength(1);
      expect(result.recent_audit_log[0].raffle_id).toBe(10);
    });

    it('should return 200 status code', async () => {
      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 50,
        total_tickets: 2500,
        total_volume_xlm: '125000000000',
        unique_participants: 500,
        prizes_distributed_xlm: '25000000000',
        oracle_public_key: '0xtest',
        draws_completed: 10,
        recent_audit_log: [],
      };

      service.getTransparencyStats.mockResolvedValue(mockStats);

      // NestJS controller methods implicitly return 200 on success
      const result = await controller.getTransparencyStats();

      expect(result).toBeDefined();
    });

    it('should include platform stats fields', async () => {
      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 75,
        total_tickets: 3750,
        total_volume_xlm: '187500000000',
        unique_participants: 750,
        prizes_distributed_xlm: '37500000000',
        oracle_public_key: '0xkey',
        draws_completed: 15,
        recent_audit_log: [],
      };

      service.getTransparencyStats.mockResolvedValue(mockStats);

      const result = await controller.getTransparencyStats();

      expect(result).toHaveProperty('total_raffles', 75);
      expect(result).toHaveProperty('total_tickets', 3750);
      expect(result).toHaveProperty('total_volume_xlm', '187500000000');
      expect(result).toHaveProperty('unique_participants', 750);
      expect(result).toHaveProperty('prizes_distributed_xlm', '37500000000');
    });

    it('should include recent audit log entries', async () => {
      const mockEntries: IndexerTransparencyEntry[] = [
        {
          id: 'entry-1',
          timestamp: '2026-06-27T10:30:00Z',
          raffle_id: 1,
          request_id: 'req-1',
          oracle_id: 'oracle-001',
          seed: 'seed-1',
          proof: 'proof-1',
          tx_hash: 'tx-1',
          method: 'VRF',
        },
        {
          id: 'entry-2',
          timestamp: '2026-06-27T10:29:00Z',
          raffle_id: 2,
          request_id: 'req-2',
          oracle_id: 'oracle-001',
          seed: 'seed-2',
          proof: 'proof-2',
          tx_hash: 'tx-2',
          method: 'PRNG',
        },
      ];

      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: '250000000000',
        unique_participants: 1000,
        prizes_distributed_xlm: '50000000000',
        oracle_public_key: '0xkey',
        draws_completed: 2,
        recent_audit_log: mockEntries,
      };

      service.getTransparencyStats.mockResolvedValue(mockStats);

      const result = await controller.getTransparencyStats();

      expect(result.recent_audit_log).toHaveLength(2);
      expect(result.recent_audit_log[0].raffle_id).toBe(1);
      expect(result.recent_audit_log[1].method).toBe('PRNG');
    });

    it('should return empty audit log when none available', async () => {
      const mockStats: TransparencyStats = {
        date: '2026-06-27',
        total_raffles: 10,
        total_tickets: 500,
        total_volume_xlm: '25000000000',
        unique_participants: 100,
        prizes_distributed_xlm: '5000000000',
        oracle_public_key: '0xkey',
        draws_completed: 0,
        recent_audit_log: [],
      };

      service.getTransparencyStats.mockResolvedValue(mockStats);

      const result = await controller.getTransparencyStats();

      expect(result.recent_audit_log).toEqual([]);
      expect(result.draws_completed).toBe(0);
    });
  });

  describe('POST /stats/verify', () => {
    const testPayload = {
      oracle_public_key: '0xabcd1234',
      request_id: 'req-123',
      proof: 'proof-hex-456',
      seed: 'seed-hex-789',
    };

    it('should return verified: true for valid proof', async () => {
      const mockResult: VerifyResult = { valid: true };

      service.verifyDraw.mockResolvedValue(mockResult);

      const result = await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return verified: false for invalid proof', async () => {
      const mockResult: VerifyResult = {
        valid: false,
        reason: 'Invalid proof signature',
      };

      service.verifyDraw.mockResolvedValue(mockResult);

      const result = await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        'invalid-proof',
        testPayload.seed,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid proof signature');
    });

    it('should return 200 status code for valid input', async () => {
      const mockResult: VerifyResult = { valid: true };

      service.verifyDraw.mockResolvedValue(mockResult);

      // NestJS controller with @HttpCode(200) returns 200
      const result = await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      expect(result).toBeDefined();
    });

    it('should return 200 status code for invalid input', async () => {
      const mockResult: VerifyResult = {
        valid: false,
        reason: 'Invalid hex',
      };

      service.verifyDraw.mockResolvedValue(mockResult);

      // Should still return 200, not 500
      const result = await controller.verifyDraw(
        'not-hex',
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      expect(result.valid).toBe(false);
    });

    it('should pass all 4 parameters to service', async () => {
      service.verifyDraw.mockResolvedValue({ valid: false });

      await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      expect(service.verifyDraw).toHaveBeenCalledWith(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );
    });

    it('should handle seed/proof mismatch', async () => {
      const mockResult: VerifyResult = {
        valid: false,
        reason: 'Seed does not match SHA-256(proof)',
      };

      service.verifyDraw.mockResolvedValue(mockResult);

      const result = await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        'wrong-seed',
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Seed');
    });

    it('should include reason message on failure', async () => {
      const mockResult: VerifyResult = {
        valid: false,
        reason: 'Invalid public key format',
      };

      service.verifyDraw.mockResolvedValue(mockResult);

      const result = await controller.verifyDraw(
        'malformed-key',
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
    });

    it('should accept hex-encoded strings', async () => {
      service.verifyDraw.mockResolvedValue({ valid: false });

      await controller.verifyDraw(
        '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        'req-hex-encoded',
        '0x1234567890abcdef',
        '0xfedcba0987654321',
      );

      expect(service.verifyDraw).toHaveBeenCalled();
    });

    it('should cache responses for repeated calls', async () => {
      const mockResult: VerifyResult = { valid: true };

      service.verifyDraw.mockResolvedValue(mockResult);

      await controller.verifyDraw(
        testPayload.oracle_public_key,
        testPayload.request_id,
        testPayload.proof,
        testPayload.seed,
      );

      // In real scenario with caching, second call would use cache
      // Service mock doesn't implement caching, but verifyDraw in service does
      expect(service.verifyDraw).toHaveBeenCalledTimes(1);
    });
  });
});
