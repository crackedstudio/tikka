import { TransparencyController } from './transparency.controller';
import { CacheService } from '../../cache/cache.service';
import {
  TransparencyEntryDto,
  TransparencyLogResponseDto,
} from './dto/transparency.dto';

describe('TransparencyController', () => {
  let controller: TransparencyController;
  let supabase: any;
  let cacheService: any;

  beforeEach(() => {
    // Mock Supabase client
    supabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      }),
    };

    // Mock CacheService
    cacheService = {
      wrap: jest.fn(),
    };

    // Create controller with mocked dependencies
    controller = new TransparencyController(supabase, cacheService);
  });

  describe('getTransparencyLog', () => {
    it('should return paginated audit log entries from Supabase', async () => {
      const mockEntries: TransparencyEntryDto[] = [
        {
          id: 'entry-1',
          timestamp: '2026-06-27T10:30:00Z',
          raffle_id: 1,
          request_id: 'req-123',
          oracle_id: 'oracle-001',
          seed: 'seed-hex-123',
          proof: 'proof-hex-456',
          tx_hash: 'tx-hash-789',
          method: 'VRF',
        },
      ];

      const mockResponse: TransparencyLogResponseDto = {
        entries: mockEntries,
        total: 50,
      };

      // Mock cache.wrap to call the callback and return result
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      // Mock Supabase query chain
      supabase.range.mockResolvedValue({
        data: mockEntries,
        count: 50,
        error: null,
      });

      const result = await controller.getTransparencyLog(20, 0);

      expect(result).toEqual(mockResponse);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].raffle_id).toBe(1);
      expect(result.total).toBe(50);
    });

    it('should apply raffle_id filter when provided', async () => {
      const mockEntries: TransparencyEntryDto[] = [
        {
          id: 'entry-2',
          timestamp: '2026-06-27T10:30:00Z',
          raffle_id: 42,
          request_id: 'req-789',
          oracle_id: 'oracle-002',
          seed: 'seed-hex-abc',
          proof: 'proof-hex-def',
          tx_hash: 'tx-hash-ghi',
          method: 'PRNG',
        },
      ];

      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: mockEntries,
        count: 1,
        error: null,
      });

      const result = await controller.getTransparencyLog(20, 0, 42);

      // Verify eq() was called with raffle_id filter
      expect(supabase.eq).toHaveBeenCalledWith('raffle_id', 42);
      expect(result.entries[0].raffle_id).toBe(42);
      expect(result.total).toBe(1);
    });

    it('should use default limit of 20 when not provided', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog();

      // Verify range was called with correct pagination (0, 19 = limit 20)
      expect(supabase.range).toHaveBeenCalledWith(0, 19);
    });

    it('should clamp limit to maximum of 100', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(500, 0);

      // Verify range uses clamped limit (0, 99 = limit 100)
      expect(supabase.range).toHaveBeenCalledWith(0, 99);
    });

    it('should use offset for pagination', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 100,
        error: null,
      });

      await controller.getTransparencyLog(20, 40);

      // Verify range was called with offset (40, 59 = limit 20 at offset 40)
      expect(supabase.range).toHaveBeenCalledWith(40, 59);
    });

    it('should cache response for 60 seconds', async () => {
      const mockResponse: TransparencyLogResponseDto = {
        entries: [],
        total: 0,
      };

      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(20, 0);

      // Verify cache.wrap was called with TTL of 60 seconds
      expect(cacheService.wrap).toHaveBeenCalledWith(
        expect.any(String),
        60,
        expect.any(Function),
      );
    });

    it('should return cached result on second call', async () => {
      const mockResponse: TransparencyLogResponseDto = {
        entries: [
          {
            id: 'cached-entry',
            timestamp: '2026-06-27T10:30:00Z',
            raffle_id: 1,
            request_id: 'req-cached',
            oracle_id: 'oracle-001',
            seed: 'seed-cached',
            proof: 'proof-cached',
            tx_hash: 'tx-cached',
            method: 'VRF',
          },
        ],
        total: 1,
      };

      // First call returns from Supabase
      let callCount = 0;
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => {
          if (callCount === 0) {
            callCount++;
            return fn();
          }
          // Second call returns cached
          return mockResponse;
        },
      );

      supabase.range.mockResolvedValue({
        data: mockResponse.entries,
        count: 1,
        error: null,
      });

      const result1 = await controller.getTransparencyLog(20, 0);
      const result2 = await controller.getTransparencyLog(20, 0);

      // Verify cache.wrap was called twice
      expect(cacheService.wrap).toHaveBeenCalledTimes(2);
      // Second result should be the cached one
      expect(result2).toEqual(mockResponse);
    });

    it('should order results by created_at descending', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(20, 0);

      // Verify order was set to created_at DESC
      expect(supabase.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should return empty entries on Supabase error', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: null,
        count: null,
        error: new Error('Supabase connection failed'),
      });

      const result = await controller.getTransparencyLog(20, 0);

      expect(result).toEqual({
        entries: [],
        total: 0,
      });
    });

    it('should transform Supabase fields to match frontend shape', async () => {
      const supabaseRow = {
        id: 'id-123',
        timestamp: '2026-06-27T10:30:00Z',
        raffle_id: 5,
        request_id: 'req-005',
        oracle_id: 'oracle-005',
        seed: 'seed-value',
        proof: 'proof-value',
        tx_hash: 'tx-value',
        method: 'VRF',
      };

      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [supabaseRow],
        count: 1,
        error: null,
      });

      const result = await controller.getTransparencyLog(20, 0);

      const entry = result.entries[0];
      expect(entry.id).toBe('id-123');
      expect(entry.timestamp).toBe('2026-06-27T10:30:00Z');
      expect(entry.raffle_id).toBe(5);
      expect(entry.request_id).toBe('req-005');
      expect(entry.oracle_id).toBe('oracle-005');
      expect(entry.seed).toBe('seed-value');
      expect(entry.proof).toBe('proof-value');
      expect(entry.tx_hash).toBe('tx-value');
      expect(entry.method).toBe('VRF');
    });

    it('should handle missing optional fields with empty strings', async () => {
      const supabaseRow = {
        id: 'id-incomplete',
        timestamp: '2026-06-27T10:30:00Z',
        raffle_id: 1,
        request_id: 'req-1',
        oracle_id: 'oracle-1',
        seed: null,
        proof: null,
        tx_hash: null,
        method: 'VRF',
      };

      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [supabaseRow],
        count: 1,
        error: null,
      });

      const result = await controller.getTransparencyLog(20, 0);

      const entry = result.entries[0];
      expect(entry.seed).toBe('');
      expect(entry.proof).toBe('');
      expect(entry.tx_hash).toBe('');
    });

    it('should build correct cache key with raffle_id filter', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(25, 50, 123);

      // Verify cache key includes all parameters
      expect(cacheService.wrap).toHaveBeenCalledWith(
        'transparency:25:50:123',
        60,
        expect.any(Function),
      );
    });

    it('should build correct cache key without raffle_id', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(25, 50);

      // Verify cache key does not include raffle_id
      expect(cacheService.wrap).toHaveBeenCalledWith(
        'transparency:25:50',
        60,
        expect.any(Function),
      );
    });

    it('should handle non-numeric limit gracefully', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      // Pass string that cannot be converted to number
      await controller.getTransparencyLog('invalid' as any, 0);

      // Should use default limit of 20
      expect(supabase.range).toHaveBeenCalledWith(0, 19);
    });

    it('should handle negative offset by using 0', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(20, -100);

      // Should clamp to 0
      expect(supabase.range).toHaveBeenCalledWith(0, 19);
    });

    it('should handle offset exceeding max', async () => {
      cacheService.wrap.mockImplementation(
        (key: string, ttl: number, fn: () => Promise<any>) => fn(),
      );

      supabase.range.mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      });

      await controller.getTransparencyLog(20, 50000);

      // Should clamp offset to 10000
      expect(supabase.range).toHaveBeenCalledWith(10000, 10019);
    });
  });
});
