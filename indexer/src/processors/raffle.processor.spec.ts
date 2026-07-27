import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RaffleProcessor } from './raffle.processor';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { WebhookService } from '../webhooks/webhook.service';
import { RaffleEntity, RaffleStatus } from '../database/entities/raffle.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';

describe('RaffleProcessor', () => {
  let processor: RaffleProcessor;
  let userProcessor: UserProcessor;
  let cacheService: CacheService;
  let webhookService: WebhookService;
  let mockQueryRunner: any;
  let mockManager: any;
  let dataSource: { createQueryRunner: jest.Mock };

  const defaultParams = {
    ticket_price: '100',
    max_tickets: 100,
    end_time: 1700000000,
    asset: 'XLM',
    metadata_cid: 'cid',
    allow_multiple: false,
  };

  beforeEach(async () => {
    mockManager = {
      createQueryBuilder: jest.fn(),
    };

    mockQueryRunner = {
      manager: mockManager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    cacheService = {
      invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
      invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
      invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
    } as any;

    webhookService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
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

  function mockInsertChain() {
    return {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
  }

  describe('handleRaffleCreated', () => {
    it('should invalidate active raffles cache', async () => {
      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertChain())
        .mockReturnValueOnce(mockInsertChain());

      await processor.handleRaffleCreated(
        1,
        'GAAAA',
        500,
        'tx-1',
        defaultParams,
      );

      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalledTimes(1);
    });

    it('should handle raffle creation with creator and ledger', async () => {
      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertChain())
        .mockReturnValueOnce(mockInsertChain());

      const raffleId = 1;
      const creator = 'GAAAA';
      const ledger = 500;

      await processor.handleRaffleCreated(
        raffleId,
        creator,
        ledger,
        'tx-1',
        defaultParams,
      );

      expect(userProcessor.handleRaffleCreated).toHaveBeenCalledWith(
        creator,
        ledger,
        mockQueryRunner,
      );
      expect(webhookService.dispatch).toHaveBeenCalledWith(
        'RaffleCreated',
        expect.objectContaining({ raffleId, creator, ledger }),
      );
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });

    it('should propagate errors from userProcessor', async () => {
      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertChain())
        .mockReturnValueOnce(mockInsertChain());

      const error = new Error('Database error');
      (userProcessor.handleRaffleCreated as jest.Mock).mockRejectedValueOnce(
        error,
      );

      await expect(
        processor.handleRaffleCreated(1, 'GAAAA', 500, 'tx-1', defaultParams),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(webhookService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleRaffleFinalized', () => {
    it('should invalidate caches and dispatch webhook', async () => {
      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertChain())
        .mockReturnValueOnce(mockInsertChain());

      await processor.handleRaffleFinalized(
        1,
        'GWINNER',
        42,
        '1000',
        600,
        'tx-final',
      );

      expect(userProcessor.handleRaffleFinalized).toHaveBeenCalled();
      expect(webhookService.dispatch).toHaveBeenCalledWith(
        'RaffleFinalized',
        expect.objectContaining({
          raffleId: 1,
          winner: 'GWINNER',
          winningTicketId: 42,
          prizeAmount: '1000',
        }),
      );
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });

    it('should propagate errors and roll back', async () => {
      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockInsertChain())
        .mockReturnValueOnce(mockInsertChain());

      (userProcessor.handleRaffleFinalized as jest.Mock).mockRejectedValueOnce(
        new Error('finalize failed'),
      );

      await expect(
        processor.handleRaffleFinalized(1, 'GWINNER', 42, '1000', 600, 'tx-f'),
      ).rejects.toThrow('finalize failed');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(webhookService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleRaffleCancelled', () => {
    it('should update raffle and dispatch webhook', async () => {
      const updateChain = mockInsertChain();
      const insertChain = mockInsertChain();
      mockManager.createQueryBuilder
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(insertChain);

      await processor.handleRaffleCancelled(1, 'expired', 700, 'tx-cancel');

      expect(updateChain.update).toHaveBeenCalledWith(RaffleEntity);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: RaffleStatus.CANCELLED }),
      );
      expect(insertChain.into).toHaveBeenCalledWith(RaffleEventEntity);
      expect(webhookService.dispatch).toHaveBeenCalledWith(
        'RaffleCancelled',
        expect.objectContaining({ raffleId: 1, reason: 'expired', ledger: 700 }),
      );
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });
  });
});
