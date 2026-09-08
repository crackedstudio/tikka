/**
 * Asserts that ingesting each contract event invalidates the expected cache
 * families. Mocks WebhookService so these tests do not depend on webhook
 * entity wiring.
 */
jest.mock('../webhooks/webhook.service', () => ({
  WebhookService: jest.fn().mockImplementation(() => ({
    dispatch: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RaffleProcessor } from '../processors/raffle.processor';
import { TicketProcessor } from '../processors/ticket.processor';
import { UserProcessor } from '../processors/user.processor';
import { CacheService } from './cache.service';
import { WebhookService } from '../webhooks/webhook.service';

describe('Cache invalidation on event ingest', () => {
  let raffleProcessor: RaffleProcessor;
  let ticketProcessor: TicketProcessor;
  let userProcessor: UserProcessor;
  let cacheService: jest.Mocked<Pick<
    CacheService,
    | 'invalidateActiveRaffles'
    | 'invalidateRaffleDetail'
    | 'invalidateUserProfile'
    | 'invalidateLeaderboard'
    | 'invalidatePlatformStats'
  >>;

  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      createQueryBuilder: jest.Mock;
      findOne: jest.Mock;
    };
    query: jest.Mock;
  };

  const chainable = () => {
    const builder: Record<string, jest.Mock> = {};
    const methods = [
      'insert',
      'into',
      'values',
      'orIgnore',
      'onConflict',
      'update',
      'set',
      'where',
      'execute',
    ];
    for (const m of methods) {
      builder[m] = jest.fn().mockReturnValue(builder);
    }
    builder.execute = jest.fn().mockResolvedValue({ affected: 1, identifiers: [] });
    // Idempotency check introduced by the TypeORM 1.x query-builder API.
    builder.getExists = jest.fn().mockResolvedValue(false);
    return builder;
  };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        createQueryBuilder: jest.fn(() => chainable()),
        findOne: jest.fn().mockResolvedValue({ lastTxHash: null, firstSeenLedger: 0 }),
      },
      query: jest.fn().mockResolvedValue([]),
    };

    cacheService = {
      invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
      invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
      invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
      invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
      invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaffleProcessor,
        TicketProcessor,
        UserProcessor,
        { provide: CacheService, useValue: cacheService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: WebhookService,
          useValue: { dispatch: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    raffleProcessor = module.get(RaffleProcessor);
    ticketProcessor = module.get(TicketProcessor);
    userProcessor = module.get(UserProcessor);
  });

  it('RaffleCreated invalidates active raffles and platform stats', async () => {
    await raffleProcessor.handleRaffleCreated(
      1,
      'GCREATOR',
      100,
      'tx-created',
      {
        ticket_price: '10000000',
        max_tickets: 10,
        end_time: 999999,
        asset: 'native',
        metadata_cid: '',
        allow_multiple: false,
      },
    );

    expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
    expect(cacheService.invalidatePlatformStats).toHaveBeenCalled();
  });

  it('TicketPurchased invalidates raffle detail and buyer profile', async () => {
    const buyer = 'GBUYER';
    jest.spyOn(userProcessor, 'handleTicketPurchased').mockResolvedValue(undefined);

    await ticketProcessor.handleTicketPurchased(
      7,
      buyer,
      [1, 2],
      '20000000',
      200,
      'tx-purchase',
      mockQueryRunner as any,
    );

    expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('7');
    expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(buyer);
  });

  it('TicketRefunded invalidates raffle detail and recipient profile', async () => {
    const recipient = 'GRECIPIENT';
    jest.spyOn(userProcessor, 'handleTicketRefunded').mockResolvedValue(undefined);

    await ticketProcessor.handleTicketRefunded(
      7,
      1,
      recipient,
      '10000000',
      'tx-refund',
      mockQueryRunner as any,
    );

    expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('7');
    expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(recipient);
  });

  it('RaffleFinalized invalidates raffle detail, leaderboard, platform stats, and winner profile', async () => {
    const winner = 'GWINNER';

    await raffleProcessor.handleRaffleFinalized(
      3,
      winner,
      1,
      '50000000',
      300,
      'tx-finalized',
    );

    expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('3');
    expect(cacheService.invalidateLeaderboard).toHaveBeenCalled();
    expect(cacheService.invalidatePlatformStats).toHaveBeenCalled();
    // Winner profile is cleared via UserProcessor.handleRaffleFinalized
    expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(winner);
  });

  it('RaffleCancelled invalidates raffle detail and active raffles', async () => {
    await raffleProcessor.handleRaffleCancelled(
      4,
      'cancelled',
      400,
      'tx-cancelled',
    );

    expect(cacheService.invalidateRaffleDetail).toHaveBeenCalledWith('4');
    expect(cacheService.invalidateActiveRaffles).toHaveBeenCalled();
  });
});
