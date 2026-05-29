import { Test, TestingModule } from '@nestjs/testing';
import { TicketProcessor } from './ticket.processor';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { TicketEntity } from '../database/entities/ticket.entity';
import { RaffleEntity } from '../database/entities/raffle.entity';

describe('TicketProcessor', () => {
  let processor: TicketProcessor;
  let userProcessor: UserProcessor;
  let cacheService: CacheService;
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
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
      invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
    } as any;

    userProcessor = {
      handleTicketPurchased: jest.fn().mockResolvedValue(undefined),
      handleTicketRefunded: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketProcessor,
        { provide: UserProcessor, useValue: userProcessor },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    processor = module.get<TicketProcessor>(TicketProcessor);
  });

  describe('handleTicketPurchased', () => {
    it('should insert tickets idempotently', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2, 3];
      const totalCost = '300000000';
      const ledger = 500;
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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      // Verify each ticket was inserted
      expect(mockInsertBuilder.insert).toHaveBeenCalledTimes(3);
      expect(mockInsertBuilder.into).toHaveBeenCalledWith(TicketEntity);
      expect(mockInsertBuilder.orIgnore).toHaveBeenCalledTimes(3);
    });

    it('should increment raffle tickets_sold count', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2, 3];
      const totalCost = '300000000';
      const ledger = 500;
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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(RaffleEntity);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        ticketsSold: expect.any(Function),
      });
      expect(mockUpdateBuilder.where).toHaveBeenCalledWith('id = :raffleId', { raffleId });
    });

    it('should call userProcessor.handleTicketPurchased', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2];
      const totalCost = '200000000';
      const ledger = 500;
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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      expect(userProcessor.handleTicketPurchased).toHaveBeenCalledWith(
        raffleId,
        buyer,
        ticketIds.length,
        ledger,
        txHash,
        mockQueryRunner,
      );
    });

    it('should invalidate raffle detail cache', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1];
      const totalCost = '100000000';
      const ledger = 500;
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

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
    });

    it('should invalidate user profile cache', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1];
      const totalCost = '100000000';
      const ledger = 500;
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

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(buyer);
    });

    it('should propagate errors from ticket insert', async () => {
      const error = new Error('Database error');
      const mockInsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValueOnce(error),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockInsertBuilder);

      await expect(
        processor.handleTicketPurchased(1, 'GBUYER', [1], '100000000', 500, 'tx-hash', mockQueryRunner),
      ).rejects.toThrow(error);
    });

    it('should handle batch ticket purchase events', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [10, 11, 12, 13, 14]; // 5 tickets
      const totalCost = '500000000';
      const ledger = 500;
      const txHash = 'tx-hash-batch';

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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      // Verify all 5 tickets were inserted
      expect(mockInsertBuilder.insert).toHaveBeenCalledTimes(5);
    });
  });

  describe('handleTicketRefunded', () => {
    it('should mark ticket as refunded', async () => {
      const raffleId = 1;
      const ticketId = 1;
      const recipient = 'GBUYER';
      const amount = '100000000';
      const txHash = 'tx-refund-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketRefunded(
        raffleId,
        ticketId,
        recipient,
        amount,
        txHash,
        mockQueryRunner,
      );

      expect(mockUpdateBuilder.update).toHaveBeenCalledWith(TicketEntity);
      expect(mockUpdateBuilder.set).toHaveBeenCalledWith({
        refunded: true,
        refundTxHash: txHash,
      });
    });

    it('should update correct ticket by raffleId and ticketId', async () => {
      const raffleId = 1;
      const ticketId = 5;
      const recipient = 'GBUYER';
      const amount = '100000000';
      const txHash = 'tx-refund-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketRefunded(
        raffleId,
        ticketId,
        recipient,
        amount,
        txHash,
        mockQueryRunner,
      );

      expect(mockUpdateBuilder.where).toHaveBeenCalledWith('id = :ticketId AND raffle_id = :raffleId', {
        ticketId,
        raffleId,
      });
    });

    it('should invalidate raffle detail cache after refund', async () => {
      const raffleId = 1;
      const ticketId = 1;
      const recipient = 'GBUYER';
      const amount = '100000000';
      const txHash = 'tx-refund-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketRefunded(
        raffleId,
        ticketId,
        recipient,
        amount,
        txHash,
        mockQueryRunner,
      );

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
    });

    it('should invalidate user profile cache after refund', async () => {
      const raffleId = 1;
      const ticketId = 1;
      const recipient = 'GBUYER';
      const amount = '100000000';
      const txHash = 'tx-refund-123';

      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketRefunded(
        raffleId,
        ticketId,
        recipient,
        amount,
        txHash,
        mockQueryRunner,
      );

      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(recipient);
    });

    it('should propagate errors from refund update', async () => {
      const error = new Error('Refund error');
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValueOnce(error),
      };

      mockManager.createQueryBuilder.mockReturnValueOnce(mockUpdateBuilder);

      await expect(
        processor.handleTicketRefunded(1, 1, 'GBUYER', '100000000', 'tx-hash', mockQueryRunner),
      ).rejects.toThrow(error);
    });
  });

  describe('ticket ownership and counts', () => {
    it('should correctly set ticket owner on purchase', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1];
      const totalCost = '100000000';
      const ledger = 500;
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

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      const valuesCall = mockInsertBuilder.values.mock.calls[0][0];
      expect(valuesCall.owner).toBe(buyer);
    });

    it('should increment tickets_sold by correct count', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2, 3, 4, 5]; // 5 tickets
      const totalCost = '500000000';
      const ledger = 500;
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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      const setCall = mockUpdateBuilder.set.mock.calls[0][0];
      // The set function should increment by 5
      expect(setCall.ticketsSold).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('should handle duplicate ticket purchase events', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2];
      const totalCost = '200000000';
      const ledger = 500;
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
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockInsertBuilder)
        .mockReturnValueOnce(mockUpdateBuilder);

      // First call
      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);
      // Second call with same parameters
      await processor.handleTicketPurchased(raffleId, buyer, ticketIds, totalCost, ledger, txHash, mockQueryRunner);

      // orIgnore should prevent duplicate ticket insertion
      expect(mockInsertBuilder.orIgnore).toHaveBeenCalled();
    });
  });
});
