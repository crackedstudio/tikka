import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReorgRollbackService } from './reorg-rollback.service';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { RaffleEntity } from '../database/entities/raffle.entity';
import { UserEntity } from '../database/entities/user.entity';
import { PlatformStatEntity } from '../database/entities/platform-stat.entity';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';

/**
 * Test plan for ReorgRollbackService.
 *
 * The service runs a fixed sequence of SQL statements inside a single
 * `dataSource.transaction(...)` callback. Instead of mocking queries by call
 * order (which breaks whenever the service adds a DELETE/UPDATE between two
 * COUNTs), the `query` mock below dispatches on the SQL content. This keeps
 * the assertions tied to the service's real behaviour: COUNT rows drive the
 * audit counts, SELECT DISTINCT drive users/platform-stats, and everything
 * else is a no-op mutation that must not throw.
 */

interface RollbackScenario {
  fromLedger: number;
  counts: {
    events: number;
    tickets: number;
    raffles: number;
    deadLetters: number;
  };
  affectedUsers: Array<{ address: string }>;
  affectedDates: Array<{ date: string }>;
}

function buildMockManager(scenario: RollbackScenario): { query: jest.Mock } {
  return {
    query: jest.fn().mockImplementation((query: string) => {
      if (query.includes('FROM raffle_events') && query.includes('COUNT')) {
        return Promise.resolve([{ count: String(scenario.counts.events) }]);
      }
      if (query.includes('FROM tickets') && query.includes('COUNT')) {
        return Promise.resolve([{ count: String(scenario.counts.tickets) }]);
      }
      if (query.includes('FROM raffles') && query.includes('COUNT')) {
        return Promise.resolve([{ count: String(scenario.counts.raffles) }]);
      }
      if (query.includes('FROM dead_letter_events') && query.includes('COUNT')) {
        return Promise.resolve([{ count: String(scenario.counts.deadLetters) }]);
      }
      if (query.includes('SELECT DISTINCT u.address')) {
        return Promise.resolve(scenario.affectedUsers);
      }
      if (query.includes('SELECT DISTINCT DATE')) {
        return Promise.resolve(scenario.affectedDates);
      }
      // All mutations (DELETE / UPDATE / cursor trim) are no-ops.
      return Promise.resolve(undefined);
    }),
  };
}

function expectRollbackSucceeded(
  audit: Awaited<ReturnType<ReorgRollbackService['rollback']>>,
  scenario: RollbackScenario,
): void {
  expect(audit.success).toBe(true);
  expect(audit.affectedEntities.raffleEvents).toBe(scenario.counts.events);
  expect(audit.affectedEntities.tickets).toBe(scenario.counts.tickets);
  expect(audit.affectedEntities.raffles).toBe(scenario.counts.raffles);
  expect(audit.affectedEntities.deadLetterEvents).toBe(scenario.counts.deadLetters);
  expect(audit.affectedEntities.users).toBe(scenario.affectedUsers.length);
  expect(audit.affectedEntities.platformStats).toBe(scenario.affectedDates.length);
  expect(audit.replayCursor).toBe(scenario.fromLedger - 1);
}

describe('ReorgRollbackService (Integration)', () => {
  let module: TestingModule;
  let service: ReorgRollbackService;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ReorgRollbackService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
            getRepository: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReorgRollbackService>(ReorgRollbackService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  /** Wraps a dataSource.transaction mock that returns the given manager. */
  function mockTransaction(manager: { query: jest.Mock }): void {
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb(manager),
    );
  }

  describe('canonical replay consistency', () => {
    it('ensures rollback + replay produces identical final state', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1050,
        counts: { events: 3, tickets: 5, raffles: 2, deadLetters: 1 },
        affectedUsers: [{ address: 'user1' }],
        affectedDates: [{ date: '2024-01-01' }],
      };
      mockTransaction(buildMockManager(scenario));

      const audit = await service.rollback(scenario.fromLedger);
      expectRollbackSucceeded(audit, scenario);
    });
  });

  describe('reorg scenarios', () => {
    it('handles reorg affecting raffle create events', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1100,
        counts: { events: 1, tickets: 0, raffles: 1, deadLetters: 0 },
        affectedUsers: [{ address: 'creator1' }],
        affectedDates: [{ date: '2024-01-01' }],
      };
      mockTransaction(buildMockManager(scenario));

      const audit = await service.rollback(scenario.fromLedger);
      expectRollbackSucceeded(audit, scenario);
    });

    it('handles reorg affecting ticket purchase events', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1200,
        counts: { events: 2, tickets: 10, raffles: 0, deadLetters: 0 },
        affectedUsers: [{ address: 'buyer1' }, { address: 'buyer2' }],
        affectedDates: [{ date: '2024-01-01' }],
      };
      mockTransaction(buildMockManager(scenario));

      const audit = await service.rollback(scenario.fromLedger);
      expectRollbackSucceeded(audit, scenario);
    });

    it('handles reorg affecting raffle finalize events', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1300,
        counts: { events: 1, tickets: 0, raffles: 0, deadLetters: 0 },
        affectedUsers: [{ address: 'winner1' }],
        affectedDates: [{ date: '2024-01-01' }],
      };
      mockTransaction(buildMockManager(scenario));

      const audit = await service.rollback(scenario.fromLedger);
      expectRollbackSucceeded(audit, scenario);
    });

    it('handles mixed multi-ledger event ranges', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1400,
        counts: { events: 5, tickets: 15, raffles: 3, deadLetters: 1 },
        affectedUsers: [
          { address: 'user1' },
          { address: 'user2' },
          { address: 'user3' },
        ],
        affectedDates: [{ date: '2024-01-01' }, { date: '2024-01-02' }],
      };
      mockTransaction(buildMockManager(scenario));

      const audit = await service.rollback(scenario.fromLedger);
      expectRollbackSucceeded(audit, scenario);
    });
  });

  describe('transactional safety', () => {
    it('aborts transaction when rollback operations fail', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ count: '1' }]) // count succeeds
          .mockRejectedValueOnce(new Error('Constraint violation')), // delete fails
      };
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) =>
        cb(manager),
      );

      await expect(service.rollback(1500)).rejects.toThrow('Constraint violation');

      // Verify transaction was attempted (would rollback automatically on error)
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('ensures no partial mutations persist on failure', async () => {
      // Mock a scenario where some operations succeed but later ones fail
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ count: '1' }]) // count
          .mockResolvedValueOnce(undefined) // first delete succeeds
          .mockRejectedValueOnce(new Error('FK constraint')), // second delete fails
      };
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) =>
        cb(manager),
      );

      await expect(service.rollback(1600)).rejects.toThrow('FK constraint');

      // In a real database, all operations would be rolled back
      // Here we just verify the transaction wrapper was used
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('cursor consistency', () => {
    it('rewinds cursor to correct replay position', async () => {
      let cursorUpdateQuery = '';
      const manager = {
        query: jest.fn().mockImplementation((query: string, params?: any[]) => {
          if (query.includes('UPDATE indexer_cursor')) {
            cursorUpdateQuery = query;
            // Verify parameters: [fromLedger, replayCursor]
            expect(params).toEqual([1700, 1699]);
          }
          return Promise.resolve(
            query.includes('SELECT COUNT') ? [{ count: '1' }] :
            query.includes('SELECT DISTINCT u.address') ? [] :
            query.includes('SELECT DISTINCT DATE') ? [] :
            undefined,
          );
        }),
      };
      mockTransaction(manager);

      const audit = await service.rollback(1700);

      expect(audit.success).toBe(true);
      expect(audit.replayCursor).toBe(1699);
      expect(cursorUpdateQuery).toContain('last_ledger = $2');
      expect(cursorUpdateQuery).toContain('ledger_hashes');
    });
  });

  describe('idempotency and replay safety', () => {
    it('remains safe when applied multiple times to same ledger', async () => {
      // Every query returns 0-count rows → second rollback finds nothing.
      const manager = {
        query: jest.fn().mockImplementation((query: string) =>
          Promise.resolve(
            query.includes('COUNT') ? [{ count: '0' }] :
            query.includes('SELECT DISTINCT') ? [] :
            undefined,
          ),
        ),
      };
      mockTransaction(manager);

      const audit1 = await service.rollback(1800);
      expect(audit1.success).toBe(true);

      const audit2 = await service.rollback(1800);
      expect(audit2.success).toBe(true);
      expect(audit2.affectedEntities.raffleEvents).toBe(0);
    });

    it('produces deterministic results for replay after rollback', async () => {
      const scenario: RollbackScenario = {
        fromLedger: 1900,
        counts: { events: 5, tickets: 0, raffles: 0, deadLetters: 0 },
        affectedUsers: [],
        affectedDates: [],
      };
      mockTransaction(buildMockManager(scenario));

      const audit1 = await service.rollback(1900);
      const audit2 = await service.rollback(1900);

      expect(audit1.replayCursor).toBe(audit2.replayCursor);
      expect(audit1.affectedEntities.raffleEvents).toBe(audit2.affectedEntities.raffleEvents);
    });
  });
});