import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from '../src/audit/audit-log.service';
import { AuditController } from '../src/audit/audit.controller';
import { SUPABASE_CLIENT } from '../src/audit/supabase.provider';
import { RecordSubmissionParams, VrfAuditRecord } from '../src/audit/audit.types';

describe('Audit Integration Test', () => {
  let auditLogService: AuditLogService;
  let auditController: AuditController;
  let supabaseClient: any;

  beforeEach(async () => {
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
          provide: SUPABASE_CLIENT,
          useValue: mockSupabase,
        },
      ],
      controllers: [AuditController],
    }).compile();

    auditLogService = module.get<AuditLogService>(AuditLogService);
    auditController = module.get<AuditController>(AuditController);
    supabaseClient = module.get(SUPABASE_CLIENT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-end audit flow', () => {
    it('should record submission and retrieve it via GET endpoint', async () => {
      const submissionParams: RecordSubmissionParams = {
        raffleId: 456,
        vrfProof: '0xdeadbeef',
        txHash: '0x123abc',
        ledger: 54321,
        oracleAddress: 'GXYZ987654321',
        timestamp: new Date('2024-06-01T12:00:00Z'),
        requestId: 'req-456',
      };

      // Mock the record flow
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });
      supabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      supabaseClient.insert.mockResolvedValue({ error: null });

      // Record the submission
      await auditLogService.record(submissionParams);

      // Verify insert was called with correct data
      expect(supabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          raffle_id: 456,
          proof: '0xdeadbeef',
          tx_hash: '0x123abc',
          ledger_sequence: 54321,
          oracle_public_key: 'GXYZ987654321',
          request_id: 'req-456',
        }),
      );

      // Mock the retrieval
      const mockRecord: VrfAuditRecord = {
        id: 2,
        raffle_id: 456,
        request_id: 'req-456',
        commitment_hash: '',
        reveal_hash: '',
        proof: '0xdeadbeef',
        seed: '',
        oracle_public_key: 'GXYZ987654321',
        status: 'revealed',
        committed_at: '2024-06-01T12:00:00Z',
        revealed_at: '2024-06-01T12:00:00Z',
        ledger_sequence: 54321,
        chain_hash: 'computed-chain-hash',
        tx_hash: '0x123abc',
      };

      supabaseClient.single.mockResolvedValueOnce({
        data: mockRecord,
        error: null,
      });

      // Retrieve via controller
      const result = await auditController.getAuditByQuery('456');

      expect(result).toEqual(mockRecord);
      expect(result.tx_hash).toBe('0x123abc');
      expect(result.proof).toBe('0xdeadbeef');
      expect(result.ledger_sequence).toBe(54321);
    });

    it('should handle multiple submissions for different raffles', async () => {
      const submissions = [
        {
          raffleId: 1,
          vrfProof: '0xproof1',
          txHash: '0xtx1',
          ledger: 1000,
          oracleAddress: 'ORACLE1',
          timestamp: new Date(),
          requestId: 'req-1',
        },
        {
          raffleId: 2,
          vrfProof: '0xproof2',
          txHash: '0xtx2',
          ledger: 2000,
          oracleAddress: 'ORACLE1',
          timestamp: new Date(),
          requestId: 'req-2',
        },
      ];

      for (const params of submissions) {
        supabaseClient.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' },
        });
        supabaseClient.single.mockResolvedValueOnce({
          data: null,
          error: null,
        });
        supabaseClient.insert.mockResolvedValue({ error: null });

        await auditLogService.record(params);
      }

      expect(supabaseClient.insert).toHaveBeenCalledTimes(2);
    });

    it('should update existing record on subsequent submission', async () => {
      const raffleId = 789;
      
      // First submission creates commit record
      const existingRecord = {
        id: 5,
        committed_at: '2024-06-01T10:00:00Z',
        commitment_hash: 'commit-hash-789',
      };

      supabaseClient.single.mockResolvedValueOnce({
        data: existingRecord,
        error: null,
      });

      supabaseClient.single.mockResolvedValueOnce({
        data: { chain_hash: 'prev-hash' },
        error: null,
      });

      supabaseClient.update.mockResolvedValue({ error: null });

      // Second submission updates with reveal
      const revealParams: RecordSubmissionParams = {
        raffleId,
        vrfProof: '0xrevealproof',
        txHash: '0xrevealtx',
        ledger: 7890,
        oracleAddress: 'ORACLE789',
        timestamp: new Date('2024-06-01T10:05:00Z'),
        requestId: 'req-789',
      };

      await auditLogService.record(revealParams);

      expect(supabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          proof: '0xrevealproof',
          tx_hash: '0xrevealtx',
          ledger_sequence: 7890,
          status: 'revealed',
        }),
      );
    });
  });

  describe('Query parameter endpoint', () => {
    it('should accept raffleId as query parameter', async () => {
      const mockRecord: VrfAuditRecord = {
        id: 10,
        raffle_id: 999,
        request_id: 'req-999',
        commitment_hash: 'commit',
        reveal_hash: 'reveal',
        proof: '0xproofdata',
        seed: 'seed',
        oracle_public_key: 'ORACLE999',
        status: 'revealed',
        committed_at: '2024-06-01T00:00:00Z',
        revealed_at: '2024-06-01T00:05:00Z',
        ledger_sequence: 99999,
        chain_hash: 'chain',
        tx_hash: '0xtxhash',
      };

      supabaseClient.single.mockResolvedValueOnce({
        data: mockRecord,
        error: null,
      });

      const result = await auditController.getAuditByQuery('999');

      expect(result).toEqual(mockRecord);
    });
  });
});
