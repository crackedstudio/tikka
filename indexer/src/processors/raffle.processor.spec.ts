import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';
import { RaffleProcessor } from './raffle.processor';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { WebhookService } from '../webhooks/webhook.service';
import { RaffleEntity, RaffleStatus } from '../database/entities/raffle.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';

describe('RaffleProcessor', () => {
  let processor: RaffleProcessor;
  let dataSource: DataSource;
  let userProcessor: UserProcessor;
  let cacheService: CacheService;
  let webhookService: WebhookService;
  let mockQueryRunner: any;
  let mockManager: any;

  beforeEach(async () => {
    // Mock EntityManager
    mockManager = {
      createQueryBuilder: jest.fn(),
    };

    // Mock QueryRunner
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: mockManager,
    };

    // Mock DataSource
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as any;

    // Mock services
    cacheService = {
      invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
      invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
    } as any;

    webhookService = {
      dispatchEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    userProcessor = {
      handleRaffleCreated: jest.fn().mockResolvedValue(undefined),
      handleRaffleFinalized: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaffleProcessor,
        { provide: DataSource, useValue: dataSource },
        { provide: UserProcessor, useValue: userProcessor },
        { provide: CacheService, useValue: cacheService },
        { provide: WebhookService, useValue: webhookService },
      ],
    }).compile();

    processor = module.get<RaffleProcessor>(RaffleProcessor);
  });

  describe('handleRaffleCreated', () => {
    it('should invalidate active raffles cache', async () => {
      await processor.handleRaffleCreated(1);

      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalledTimes(1);
    });

    it('should handle raffle creation with creator and ledger', async () => {
      const raffleId = 1;
      const creator = 'GAAAA';
      const ledger = 500;

      const result = await processor.handleRaffleCreated(raffleId, creator, ledger);

      expect(dataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(userProcessor.handleRaffleCreated).toHaveBeenCalledWith(creator, ledger, mockQueryRunner);
      // Processor returns QueryRunner without committing — caller (LedgerPoller) commits
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(result).toBe(mockQueryRunner);
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Database error');
      (userProcessor.handleRaffleCreated as jest.Mock).mockRejectedValueOnce(error);

      await expect(processor.handleRaffleCreated(1, 'GAAAA', 500)).rejects.toThrow(error);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle raffle creation without creator and ledger', async () => {
      await processor.handleRaffleCreated(1);

      expect(userProcessor.handleRaffleCreated).not.toHaveBeenCalled();
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });
  });

  describe('handleRaffleFinalized', () => {
    it('should invalidate raffle detail and leaderboard cache', async () => {
      await processor.handleRaffleFinalized(1);

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalledTimes(1);
    });

    it('should handle raffle finalization with winner and prize', async () => {
      const raffleId = 2;
      const winner = 'GBBBB';
      const prizeAmount = '100000000';

      const result = await processor.handleRaffleFinalized(raffleId, winner, prizeAmount);

      expect(dataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(userProcessor.handleRaffleFinalized).toHaveBeenCalledWith(
        raffleId,
        winner,
        prizeAmount,
        mockQueryRunner,
      );
      // Processor returns QueryRunner without committing — caller (LedgerPoller) commits
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(result).toBe(mockQueryRunner);
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('2');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });

    it('should use default prize amount of 0 if not provided', async () => {
      const raffleId = 3;
      const winner = 'GCCCC';

      await processor.handleRaffleFinalized(raffleId, winner);

      expect(userProcessor.handleRaffleFinalized).toHaveBeenCalledWith(
        raffleId,
        winner,
        '0',
        mockQueryRunner,
      );
    });

    it('should rollback transaction on error during finalization', async () => {
      const error = new Error('Finalization error');
      (userProcessor.handleRaffleFinalized as jest.Mock).mockRejectedValueOnce(error);

      await expect(processor.handleRaffleFinalized(1, 'GAAAA', '100000000')).rejects.toThrow(error);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should handle finalization without winner', async () => {
      await processor.handleRaffleFinalized(1);

      expect(userProcessor.handleRaffleFinalized).not.toHaveBeenCalled();
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalled();
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });
  });

  describe('handleRaffleCancelled', () => {
    it('should insert raffle event and update raffle status', async () => {
      const raffleId = 1;
      const reason = 'Insufficient participants';
      const ledger = 600;
      const txHash = 'tx-hash-123';

      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockInsertBuilder.into).toHaveBeenCalledWith(RaffleEventEntity);
      expect(mockInsertBuilder.values).toHaveBeenCalledWith({
        raffleId,
        eventType: 'RaffleCancelled',
        ledger,
        txHash,
        payloadJson: {
          raffle_id: raffleId,
          reason,
        },
      });
      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(RaffleEntity);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        status: RaffleStatus.CANCELLED,
        finalizedLedger: ledger,
      });
      // Processor returns QueryRunner without committing — caller (LedgerPoller) commits
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });

    it('should be idempotent - re-processing same cancellation is no-op', async () => {
      const raffleId = 1;
      const reason = 'Cancelled';
      const ledger = 600;
      const txHash = 'tx-hash-123';

      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      // First call
      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash);
      // Second call with same parameters
      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash);

      // orIgnore should prevent duplicate event insertion
      expect(mockInsertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Cancellation error');
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValueOnce(error),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockInsertBuilder);

      await expect(processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash')).rejects.toThrow(error);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should invalidate caches after successful cancellation', async () => {
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash');

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });
  });

  describe('raffle status transitions', () => {
    it('should transition from OPEN to CANCELLED', async () => {
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash');

      const setCall = mockUpdateBuilder.set.mock.calls[0][0];
      expect(setCall.status).toBe(RaffleStatus.CANCELLED);
    });

    it('should record correct ledger on status transition', async () => {
      const ledger = 750;
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', ledger, 'tx-hash');

      const setCall = mockUpdateBuilder.set.mock.calls[0][0];
      expect(setCall.finalizedLedger).toBe(ledger);
    });
  });

  describe('upsert parameters', () => {
    it('should use orIgnore for idempotent event insertion', async () => {
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash');

      expect(mockInsertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('should include all required fields in event payload', async () => {
      const raffleId = 5;
      const reason = 'Low participation';
      const ledger = 800;
      const txHash = 'tx-abc-def';

      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      };

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash);

      const valuesCall = mockInsertBuilder.values.mock.calls[0][0];
      expect(valuesCall).toEqual({
        raffleId,
        eventType: 'RaffleCancelled',
        ledger,
        txHash,
        payloadJson: {
          raffle_id: raffleId,
          reason,
        },
      });
    });
  });
});
