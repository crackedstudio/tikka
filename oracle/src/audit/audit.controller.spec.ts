import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import { VrfAuditRecord, AuditChainAnchor, ChainVerificationResult } from './audit.types';

describe('AuditController', () => {
  let controller: AuditController;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockAuditRecord: VrfAuditRecord = {
    id: 1,
    raffle_id: 123,
    request_id: 'req-123',
    commitment_hash: 'commit-hash',
    reveal_hash: 'reveal-hash',
    proof: '0x1234567890abcdef',
    seed: 'seed-value',
    oracle_public_key: 'GABCD1234567890',
    status: 'revealed',
    committed_at: '2024-01-01T00:00:00Z',
    revealed_at: '2024-01-01T00:05:00Z',
    ledger_sequence: 12345,
    chain_hash: 'chain-hash-value',
    tx_hash: '0xabcdef1234567890',
  };

  const mockAnchor: AuditChainAnchor = {
    id: 1,
    chain_head_hash: 'abc123',
    record_count: 42,
    anchored_at: '2024-01-01T00:00:00Z',
    anchor_type: 'api',
    external_ref: null,
  };

  const mockChainVerification: ChainVerificationResult = {
    valid: true,
    total_records: 42,
    first_broken_at: null,
    first_broken_record_id: null,
    expected_hash: null,
    stored_hash: null,
  };

  const mockAnchorVerification = {
    matches: true,
    anchoredHash: 'abc123',
    currentHead: 'abc123',
    anchoredAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    const mockAuditLogServiceProvider = {
      provide: AuditLogService,
      useValue: {
        getByRaffleId: jest.fn(),
        getByTimeRange: jest.fn(),
        getByStatus: jest.fn(),
        getSummary: jest.fn(),
        verifyChain: jest.fn(),
        anchorChainHead: jest.fn(),
        getLatestAnchor: jest.fn(),
        getAnchorHistory: jest.fn(),
        verifyAnchor: jest.fn(),
        getChainHead: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [mockAuditLogServiceProvider],
    }).compile();

    controller = module.get<AuditController>(AuditController);
    auditLogService = module.get(AuditLogService);
  });

  describe('GET /oracle/audit/:raffleId', () => {
    it('should return audit record for valid raffleId', async () => {
      auditLogService.getByRaffleId.mockResolvedValue(mockAuditRecord);

      const result = await controller.getAuditRecord('123');

      expect(result).toEqual(mockAuditRecord);
      expect(auditLogService.getByRaffleId).toHaveBeenCalledWith(123);
    });

    it('should throw BadRequestException for invalid raffleId', async () => {
      await expect(controller.getAuditRecord('invalid')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getAuditRecord('0')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getAuditRecord('-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when record does not exist', async () => {
      auditLogService.getByRaffleId.mockResolvedValue(null);

      await expect(controller.getAuditRecord('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /oracle/audit?raffleId=:id', () => {
    it('should return audit record for valid raffleId query param', async () => {
      auditLogService.getByRaffleId.mockResolvedValue(mockAuditRecord);

      const result = await controller.getAuditByQuery('123');

      expect(result).toEqual(mockAuditRecord);
      expect(auditLogService.getByRaffleId).toHaveBeenCalledWith(123);
    });

    it('should throw BadRequestException when raffleId query param is missing', async () => {
      await expect(controller.getAuditByQuery(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid raffleId query param', async () => {
      await expect(controller.getAuditByQuery('invalid')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getAuditByQuery('0')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when record does not exist', async () => {
      auditLogService.getByRaffleId.mockResolvedValue(null);

      await expect(controller.getAuditByQuery('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /oracle/audit/chain/verify', () => {
    it('should return chain verification result', async () => {
      auditLogService.verifyChain.mockResolvedValue(mockChainVerification);

      const result = await controller.verifyChain();

      expect(result).toEqual(mockChainVerification);
      expect(auditLogService.verifyChain).toHaveBeenCalledWith(undefined);
    });

    it('should accept fromId query parameter', async () => {
      auditLogService.verifyChain.mockResolvedValue(mockChainVerification);

      const result = await controller.verifyChain('100');

      expect(result).toEqual(mockChainVerification);
      expect(auditLogService.verifyChain).toHaveBeenCalledWith(100);
    });

    it('should throw BadRequestException for invalid fromId', async () => {
      await expect(controller.verifyChain('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('POST /oracle/audit/chain/anchor', () => {
    it('should create a chain anchor', async () => {
      auditLogService.anchorChainHead.mockResolvedValue(mockAnchor);

      const result = await controller.anchorChain('api', 'https://example.com');

      expect(result).toEqual(mockAnchor);
      expect(auditLogService.anchorChainHead).toHaveBeenCalledWith('api', 'https://example.com');
    });
  });

  describe('GET /oracle/audit/chain/anchor', () => {
    it('should return latest anchor', async () => {
      auditLogService.getLatestAnchor.mockResolvedValue(mockAnchor);

      const result = await controller.getLatestAnchor();

      expect(result).toEqual(mockAnchor);
    });

    it('should throw NotFoundException when no anchor exists', async () => {
      auditLogService.getLatestAnchor.mockResolvedValue(null);

      await expect(controller.getLatestAnchor()).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /oracle/audit/chain/anchor/verify', () => {
    it('should verify anchor matches chain head', async () => {
      auditLogService.verifyAnchor.mockResolvedValue(mockAnchorVerification);

      const result = await controller.verifyAnchor();

      expect(result).toEqual(mockAnchorVerification);
    });

    it('should throw NotFoundException when no anchor exists', async () => {
      auditLogService.verifyAnchor.mockResolvedValue(null);

      await expect(controller.verifyAnchor()).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /oracle/audit/chain/head', () => {
    it('should return chain head hash', async () => {
      auditLogService.getChainHead.mockResolvedValue('abc123');

      const result = await controller.getChainHead();

      expect(result).toEqual({ chain_head_hash: 'abc123' });
    });
  });
});