import { Test, TestingModule } from '@nestjs/testing';
import { TicketProcessor } from './ticket.processor';
import { UserProcessor } from './user.processor';
import { CacheService } from '../cache/cache.service';
import { WebhookService } from '../webhooks/webhook.service';
import { TicketEntity } from '../database/entities/ticket.entity';
import { RaffleEntity } from '../database/entities/raffle.entity';

describe('TicketProcessor', () => {
  let processor: TicketProcessor;
  let userProcessor: UserProcessor;
  let cacheService: CacheService;
  let webhookService: WebhookService;
  let mockQueryRunner: any;
  let mockManager: any;

  function existsBuilder(exists: boolean) {
    return {
      where: jest.fn().mockReturnValue({
        getExists: jest.fn().mockResolvedValue(exists),
      }),
    };
  }

  function insertBuilder() {
    return {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [{}], raw: { rowCount: 1 } }),
    };
  }

  function updateBuilder() {
    return {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
  }

  /** First QB call is the idempotency getExists; remaining calls are insert/update. */
  function mockPurchaseFlow(ticketCount: number, alreadyApplied = false) {
    const insert = insertBuilder();
    const update = updateBuilder();
    const queue: unknown[] = [existsBuilder(alreadyApplied)];
    if (!alreadyApplied) {
      for (let i = 0; i < ticketCount; i++) queue.push(insert);
      queue.push(update);
    }
    mockManager.createQueryBuilder.mockImplementation(() => queue.shift());
    return { insert, update };
  }

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
      invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
    } as any;

    userProcessor = {
      handleTicketPurchased: jest.fn().mockResolvedValue(undefined),
      handleTicketRefunded: jest.fn().mockResolvedValue(undefined),
    } as any;

    webhookService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketProcessor,
        { provide: UserProcessor, useValue: userProcessor },
        { provide: CacheService, useValue: cacheService },
        { provide: WebhookService, useValue: webhookService },
      ],
    }).compile();

    processor = module.get<TicketProcessor>(TicketProcessor);
  });

  describe('handleTicketPurchased', () => {
    it('should insert tickets idempotently', async () => {
      const raffleId = 1;
      const buyer = 'GBUYER';
      const ticketIds = [1, 2, 3];
      const { insert } = mockPurchaseFlow(ticketIds.length);

      await processor.handleTicketPurchased(
        raffleId, buyer, ticketIds, '300000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(insert.insert).toHaveBeenCalledTimes(3);
      expect(insert.into).toHaveBeenCalledWith(TicketEntity);
      expect(insert.orIgnore).toHaveBeenCalledTimes(3);
    });

    it('should increment raffle tickets_sold count', async () => {
      const ticketIds = [1, 2, 3];
      const { update } = mockPurchaseFlow(ticketIds.length);

      await processor.handleTicketPurchased(
        1, 'GBUYER', ticketIds, '300000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(update.update).toHaveBeenCalledWith(RaffleEntity);
      expect(update.set).toHaveBeenCalledWith({
        ticketsSold: expect.any(Function),
      });
    });

    it('should call userProcessor.handleTicketPurchased', async () => {
      const ticketIds = [1, 2];
      mockPurchaseFlow(ticketIds.length);

      await processor.handleTicketPurchased(
        1, 'GBUYER', ticketIds, '200000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(userProcessor.handleTicketPurchased).toHaveBeenCalledWith(
        1, 'GBUYER', 2, 500, 'tx-hash-123', mockQueryRunner,
      );
    });

    it('should invalidate caches and dispatch webhook', async () => {
      mockPurchaseFlow(1);

      await processor.handleTicketPurchased(
        1, 'GBUYER', [1], '100000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith('GBUYER');
      expect(webhookService.dispatch).toHaveBeenCalledWith(
        'TicketPurchased',
        expect.objectContaining({ raffleId: 1, buyer: 'GBUYER' }),
      );
    });

    it('should skip all side effects when the purchase tx was already applied', async () => {
      const { insert, update } = mockPurchaseFlow(2, true);

      await processor.handleTicketPurchased(
        1, 'GBUYER', [1, 2], '200000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(insert.insert).not.toHaveBeenCalled();
      expect(update.update).not.toHaveBeenCalled();
      expect(userProcessor.handleTicketPurchased).not.toHaveBeenCalled();
      expect(webhookService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleTicketRefunded', () => {
    it('should mark ticket as refunded only when not already refunded', async () => {
      const update = updateBuilder();
      mockManager.createQueryBuilder.mockReturnValue(update);

      await processor.handleTicketRefunded(
        1, 5, 'GBUYER', '100000000', 'tx-refund', mockQueryRunner,
      );

      expect(update.update).toHaveBeenCalledWith(TicketEntity);
      expect(update.set).toHaveBeenCalledWith({
        refunded: true,
        refundTxHash: 'tx-refund',
      });
      expect(update.where).toHaveBeenCalledWith(
        'id = :ticketId AND raffle_id = :raffleId AND refunded = false',
        { ticketId: 5, raffleId: 1 },
      );
      expect(userProcessor.handleTicketRefunded).toHaveBeenCalledWith('GBUYER', '1');
    });
  });

  describe('idempotency', () => {
    it('should no-op on duplicate ticket purchase events', async () => {
      // First delivery
      mockPurchaseFlow(2, false);
      await processor.handleTicketPurchased(
        1, 'GBUYER', [1, 2], '200000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      // Second delivery — already applied
      mockPurchaseFlow(2, true);
      await processor.handleTicketPurchased(
        1, 'GBUYER', [1, 2], '200000000', 500, 'tx-hash-123', mockQueryRunner,
      );

      expect(userProcessor.handleTicketPurchased).toHaveBeenCalledTimes(1);
      expect(webhookService.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
