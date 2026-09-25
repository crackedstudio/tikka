import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { OracleLoggerService } from '../logger/oracle-logger';
import { SUPABASE_CLIENT } from './supabase.provider';
import { RecordSubmissionParams } from './audit.types';

describe('AuditLogService - record()', () => {
  let service: AuditLogService;
  let supabaseClient: any;
  let loggerMock: { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  beforeEach(async () => {
    loggerMock = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: OracleLoggerService,
          useValue: loggerMock,
        },
        {
          provide: SUPABASE_CLIENT,
          useValue: mockSupabase,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    supabaseClient = module.get(SUPABASE_CLIENT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('record', () => {
    const mockParams: RecordSubmissionParams = {
      raffleId: 123,
      vrfProof: '0x1234567890abcdef',
      txHash: '0xabcdef1234567890',
      ledger: 12345,
      oracleAddress: 'GABCD1234567890',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      requestId: 'req-123',
    };

    it('should create a new audit record when none exists', async () => {
      // Mock no existing record
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      // Mock getPreviousChainHash (returns GENESIS)
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock successful insert
      supabaseClient.insert.mockResolvedValue({ error: null });

      await service.record(mockParams);

      expect(supabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          raffle_id: 123,
          proof: '0x1234567890abcdef',
          tx_hash: '0xabcdef1234567890',
          ledger_sequence: 12345,
          oracle_public_key: 'GABCD1234567890',
          request_id: 'req-123',
          status: 'revealed',
        }),
      );
    });

    it('should update existing audit record when one exists', async () => {
      // Mock existing record
      supabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 1,
          committed_at: '2024-01-01T00:00:00Z',
          commitment_hash: 'existing-commit-hash',
        },
        error: null,
      });

      // Mock getPreviousChainHash
      supabaseClient.single.mockResolvedValueOnce({
        data: { chain_hash: 'previous-hash' },
        error: null,
      });

      // Mock successful update
      supabaseClient.update.mockResolvedValue({ error: null });

      await service.record(mockParams);

      expect(supabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          proof: '0x1234567890abcdef',
          tx_hash: '0xabcdef1234567890',
          ledger_sequence: 12345,
          oracle_public_key: 'GABCD1234567890',
          request_id: 'req-123',
          status: 'revealed',
        }),
      );
      expect(supabaseClient.eq).toHaveBeenCalledWith('raffle_id', 123);
    });

    it('should not throw error on database failure', async () => {
      // Mock database error
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      // Should not throw, just log error
      await expect(service.record(mockParams)).resolves.not.toThrow();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should handle missing requestId gracefully', async () => {
      const paramsWithoutRequestId = { ...mockParams };
      delete paramsWithoutRequestId.requestId;

      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      supabaseClient.insert.mockResolvedValue({ error: null });

      await service.record(paramsWithoutRequestId);

      expect(supabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: null,
        }),
      );
    });

    it('should log success message on successful record', async () => {
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      supabaseClient.insert.mockResolvedValue({ error: null });

      await service.record(mockParams);

      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Audit record saved for raffle 123'),
      );
    });
  });
});
