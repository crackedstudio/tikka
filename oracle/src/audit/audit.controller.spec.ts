import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import { VrfAuditRecord } from './audit.types';

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

  beforeEach(async () => {
    const mockAuditLogServiceProvider = {
      provide: AuditLogService,
      useValue: {
        getByRaffleId: jest.fn(),
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
});
