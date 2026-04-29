import { Test, TestingModule } from '@nestjs/testing';
import { RaffleProcessor } from './raffle.processor';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { WebhookService } from '../webhooks/webhook.service';
import { RaffleEntity, RaffleStatus } from '../database/entities/raffle.entity';

describe('RaffleProcessor', () => {
  let processor: RaffleProcessor;
  let userProcessor: UserProcessor;
  let cacheService: CacheService;
  let webhookService: WebhookService;
  let mockQueryRunner: any;
  let mockManager: any;

  beforeEach(async () => {
    mockManager = {
      createQueryBuilder: jest.fn(),
    };

    mockQueryRunner = {
      manager: mockManager,
    };

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
        { provide: UserProcessor, useValue: userProcessor },
        { provide: CacheService, useValue: cacheService },
        { provide: WebhookService, useValue: webhookService },
      ],
    }).compile();

    processor = module.get<RaffleProcessor>(RaffleProcessor);
  });

  describe('handleRaffleCreated', () => {
    it('should invalidate active raffles cache', async () => {
      await processor.handleRaffleCreated(1, undefined, undefined, mockQueryRunner);

      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalledTimes(1);
    });

    it('should handle raffle creation with creator and ledger', async () => {
      const raffleId = 1;
      const creator = 'GAAAA';
      const ledger = 500;

      await processor.handleRaffleCreated(raffleId, creator, ledger, mockQueryRunner);

      expect(userProcessor.handleRaffleCreated).toHaveBeenCalledWith(creator, ledger, mockQueryRunner);
      expect(webhookService.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RaffleCreated',
          raffleId,
          data: { creator, ledger },
        }),
      );
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });

    it('should propagate errors from userProcessor', async () => {
      const error = new Error('Database error');
      (userProcessor.handleRaffleCreated as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        processor.handleRaffleCreated(1, 'GAAAA', 500, mockQueryRunner),
      ).rejects.toThrow(error);
    });

    it('should handle raffle creation without creator and ledger', async () => {
      await processor.handleRaffleCreated(1, undefined, undefined, mockQueryRunner);

      expect(userProcessor.handleRaffleCreated).not.toHaveBeenCalled();
      expect(webhookService.dispatchEvent).not.toHaveBeenCalled();
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });
  });

  describe('handleRaffleFinalized', () => {
    it('should invalidate raffle detail and leaderboard cache', async () => {
      await processor.handleRaffleFinalized(1, undefined, undefined, mockQueryRunner);

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalledTimes(1);
    });

    it('should handle raffle finalization with winner and prize', async () => {
      const raffleId = 2;
      const winner = 'GBBBB';
      const prizeAmount = '100000000';

      await processor.handleRaffleFinalized(raffleId, winner, prizeAmount, mockQueryRunner);

      expect(userProcessor.handleRaffleFinalized).toHaveBeenCalledWith(
        raffleId,
        winner,
        prizeAmount,
        mockQueryRunner,
      );
      expect(webhookService.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RaffleFinalized',
          raffleId,
          data: { winner, prizeAmount },
        }),
      );
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('2');
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });

    it('should use default prize amount of 0 if not provided', async () => {
      const raffleId = 3;
      const winner = 'GCCCC';

      await processor.handleRaffleFinalized(raffleId, winner, undefined, mockQueryRunner);

      expect(userProcessor.handleRaffleFinalized).toHaveBeenCalledWith(
        raffleId,
        winner,
        '0',
        mockQueryRunner,
      );
    });

    it('should propagate errors from userProcessor during finalization', async () => {
      const error = new Error('Finalization error');
      (userProcessor.handleRaffleFinalized as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        processor.handleRaffleFinalized(1, 'GAAAA', '100000000', mockQueryRunner),
      ).rejects.toThrow(error);
    });

    it('should handle finalization without winner', async () => {
      await processor.handleRaffleFinalized(1, undefined, undefined, mockQueryRunner);

      expect(userProcessor.handleRaffleFinalized).not.toHaveBeenCalled();
      expect(webhookService.dispatchEvent).not.toHaveBeenCalled();
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalled();
      expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    });
  });

  describe('handleRaffleCancelled', () => {
    it('should update raffle status (event row is inserted by dispatcher)', async () => {
      const raffleId = 1;
      const reason = 'Insufficient participants';
      const ledger = 600;
      const txHash = 'tx-hash-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash, mockQueryRunner);

      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(RaffleEntity);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        status: RaffleStatus.CANCELLED,
        finalizedLedger: ledger,
      });
      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });

    it('should be safe to process cancellation more than once', async () => {
      const raffleId = 1;
      const reason = 'Cancelled';
      const ledger = 600;
      const txHash = 'tx-hash-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder
        .mockReturnValueOnce(mockUpdateBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash, mockQueryRunner);
      await processor.handleRaffleCancelled(raffleId, reason, ledger, txHash, mockQueryRunner);

      expect(mockUpdateBuilder.execute).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from update', async () => {
      const error = new Error('Cancellation error');
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValueOnce(error),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await expect(
        processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash', mockQueryRunner),
      ).rejects.toThrow(error);
    });

    it('should invalidate caches after successful cancellation', async () => {
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash', mockQueryRunner);

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    });
  });

  describe('raffle status transitions', () => {
    it('should transition from OPEN to CANCELLED', async () => {
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', 600, 'tx-hash', mockQueryRunner);

      const setCall = mockUpdateBuilder.set.mock.calls[0][0];
      expect(setCall.status).toBe(RaffleStatus.CANCELLED);
    });

    it('should record correct ledger on status transition', async () => {
      const ledger = 750;
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleRaffleCancelled(1, 'reason', ledger, 'tx-hash', mockQueryRunner);

      const setCall = mockUpdateBuilder.set.mock.calls[0][0];
      expect(setCall.finalizedLedger).toBe(ledger);
    });
  });
});
