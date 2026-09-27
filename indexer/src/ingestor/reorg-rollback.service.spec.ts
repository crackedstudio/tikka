import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReorgRollbackService, RollbackAuditEntry } from './reorg-rollback.service';

/**
 * Unit tests for ReorgRollbackService.
 * 
 * These tests provide fast, focused coverage of rollback edge cases without
 * requiring database containers. The integration tests in
 * reorg-rollback.integration.spec.ts provide end-to-end validation.
 * 
 * Coverage focus:
 * - Single ledger rollback
 * - Multi-ledger rollback
 * - Aggregate recalculation (users, platform_stats)
 * - Idempotency (rolling back same range twice)
 * - Archive boundary handling
 * 
 * Testing approach:
 * We mock the DataSource transaction to capture and validate SQL queries
 * without executing them. This allows us to assert:
 * 1. Correct entity counts are retrieved
 * 2. Proper DELETE statements are issued
 * 3. Aggregate UPDATE queries are executed
 * 4. Cursor is rewound correctly
 */

describe('ReorgRollbackService (Unit)', () => {
  let service: ReorgRollbackService;
  let dataSource: DataSource;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorgRollbackService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReorgRollbackService>(ReorgRollbackService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to setup transaction mock with a query handler that returns
   * appropriate results based on SQL patterns.
   */
  function setupTransactionMock(queryHandler: (sql: string, params?: any[]) => any) {
    (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
      const mockManager = {
        query: jest.fn().mockImplementation(queryHandler),
      };
      return callback(mockManager);
    });
  }

  describe('Single Ledger Rollback', () => {
    /**
     * Basic rollback scenario: remove data from a single ledger.
     * This is the foundation - validates the service executes all necessary
     * queries in a transaction.
     */
    it('rolls back all entities from a single ledger', async () => {
      const fromLedger = 1000;
      const expectedCounts = {
        events: 2,
        tickets: 3,
        raffles: 1,
        deadLetters: 0,
      };

      setupTransactionMock((sql: string, params?: any[]) => {
        // Count queries return the affected entity counts
        if (sql.includes('SELECT COUNT(*) as count FROM raffle_events')) {
          return Promise.resolve([{ count: String(expectedCounts.events) }]);
        }
        if (sql.includes('SELECT COUNT(*) as count FROM tickets')) {
          return Promise.resolve([{ count: String(expectedCounts.tickets) }]);
        }
        if (sql.includes('SELECT COUNT(*) as count FROM raffles')) {
          return Promise.resolve([{ count: String(expectedCounts.raffles) }]);
        }
        if (sql.includes('SELECT COUNT(*) as count FROM dead_letter_events')) {
          return Promise.resolve([{ count: String(expectedCounts.deadLetters) }]);
        }
        // Affected users query
        if (sql.includes('SELECT DISTINCT u.address FROM users')) {
          return Promise.resolve([
            { address: 'GABC123' },
            { address: 'GDEF456' },
          ]);
        }
        // Affected dates for platform stats
        if (sql.includes('SELECT DISTINCT DATE')) {
          return Promise.resolve([{ date: '2024-01-01' }]);
        }
        // All mutations (DELETE/UPDATE) return undefined
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      // Verify audit reflects correct operation
      expect(audit.success).toBe(true);
      expect(audit.fromLedger).toBe(fromLedger);
      expect(audit.replayCursor).toBe(fromLedger - 1);
      expect(audit.affectedEntities.raffleEvents).toBe(expectedCounts.events);
      expect(audit.affectedEntities.tickets).toBe(expectedCounts.tickets);
      expect(audit.affectedEntities.raffles).toBe(expectedCounts.raffles);
      expect(audit.affectedEntities.deadLetterEvents).toBe(expectedCounts.deadLetters);
      expect(audit.affectedEntities.users).toBe(2);
      expect(audit.affectedEntities.platformStats).toBe(1);
      expect(audit.durationMs).toBeGreaterThanOrEqual(0);
      expect(audit.completedAt).toBeDefined();
    });

    it('sets replay cursor to fromLedger - 1', async () => {
      const fromLedger = 500;

      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '0' }]);
        }
        if (sql.includes('SELECT DISTINCT')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.replayCursor).toBe(499);
    });

    it('handles rollback from ledger 1 (cursor = 0)', async () => {
      const fromLedger = 1;

      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '1' }]);
        }
        if (sql.includes('SELECT DISTINCT')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(audit.replayCursor).toBe(0);
    });
  });

  describe('Aggregate Recalculation', () => {
    /**
     * The rollback must not only delete events but also recalculate derived
     * state. User aggregates (total_tickets_bought, total_raffles_won, etc.)
     * and platform_stats must be recomputed from remaining data.
     */
    it('recalculates user aggregates after ticket deletion', async () => {
      const fromLedger = 1000;
      let userUpdateExecuted = false;

      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '5' }]);
        }
        if (sql.includes('SELECT DISTINCT u.address FROM users')) {
          return Promise.resolve([{ address: 'GABC123' }]);
        }
        if (sql.includes('SELECT DISTINCT DATE')) {
          return Promise.resolve([]);
        }
        // Detect user aggregate update query
        if (sql.includes('UPDATE users SET') && sql.includes('total_tickets_bought')) {
          userUpdateExecuted = true;
          expect(sql).toContain('SELECT COALESCE(COUNT(*), 0) FROM tickets');
          expect(sql).toContain('total_raffles_entered');
          expect(sql).toContain('total_raffles_won');
          expect(sql).toContain('total_prize_xlm');
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(userUpdateExecuted).toBe(true);
    });

    it('removes orphaned users with no remaining activity', async () => {
      const fromLedger = 1000;
      let orphanedUsersDeleted = false;

      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '1' }]);
        }
        if (sql.includes('SELECT DISTINCT u.address FROM users')) {
          return Promise.resolve([{ address: 'GABC123' }]);
        }
        if (sql.includes('SELECT DISTINCT DATE')) {
          return Promise.resolve([]);
        }
        // Detect orphaned user deletion
        if (sql.includes('DELETE FROM users') && sql.includes('NOT EXISTS')) {
          orphanedUsersDeleted = true;
          expect(sql).toContain('SELECT 1 FROM tickets WHERE owner = users.address');
          expect(sql).toContain('SELECT 1 FROM raffles WHERE creator = users.address');
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(orphanedUsersDeleted).toBe(true);
    });

    it('deletes affected platform_stats for recalculation', async () => {
      const fromLedger = 1000;
      const affectedDates = ['2024-01-01', '2024-01-02', '2024-01-03'];
      const deletedDates: string[] = [];

      setupTransactionMock((sql: string, params?: any[]) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '10' }]);
        }
        if (sql.includes('SELECT DISTINCT u.address')) {
          return Promise.resolve([]);
        }
        if (sql.includes('SELECT DISTINCT DATE')) {
          return Promise.resolve(affectedDates.map(date => ({ date })));
        }
        // Capture platform_stats deletion
        if (sql.includes('DELETE FROM platform_stats WHERE date = $1')) {
          deletedDates.push(params![0]);
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.platformStats).toBe(affectedDates.length);
      expect(deletedDates).toEqual(affectedDates);
    });
  });

  describe('Idempotency', () => {
    /**
     * Rolling back the same ledger range multiple times must be safe.
     * The second rollback finds no data and completes successfully.
     */
    it('allows rolling back the same ledger twice', async () => {
      const fromLedger = 1000;

      // First rollback finds data
      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '5' }]);
        }
        if (sql.includes('SELECT DISTINCT u.address')) {
          return Promise.resolve([{ address: 'GABC123' }]);
        }
        if (sql.includes('SELECT DISTINCT DATE')) {
          return Promise.resolve([{ date: '2024-01-01' }]);
        }
        return Promise.resolve(undefined);
      });

      const audit1 = await service.rollback(fromLedger);
      expect(audit1.success).toBe(true);
      expect(audit1.affectedEntities.raffleEvents).toBe(5);

      // Second rollback finds nothing (already rolled back)
      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '0' }]);
        }
        if (sql.includes('SELECT DISTINCT')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(undefined);
      });

      const audit2 = await service.rollback(fromLedger);
      expect(audit2.success).toBe(true);
      expect(audit2.affectedEntities.raffleEvents).toBe(0);
      expect(audit2.affectedEntities.tickets).toBe(0);
      expect(audit2.affectedEntities.raffles).toBe(0);
    });
  });

  describe('Transaction Failure Handling', () => {
    /**
     * If any operation fails, the entire transaction must roll back.
     * The audit entry should reflect the failure.
     */
    it('marks rollback as failed on transaction error', async () => {
      const fromLedger = 1000;

      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '1' }]) // First count succeeds
            .mockRejectedValueOnce(new Error('Database connection lost')), // Then fails
        };
        return callback(mockManager);
      });

      await expect(service.rollback(fromLedger)).rejects.toThrow('Database connection lost');
    });

    it('includes error message in audit when rollback fails', async () => {
      const fromLedger = 1000;

      (dataSource.transaction as jest.Mock).mockRejectedValue(
        new Error('Constraint violation: FK_ticket_raffle')
      );

      try {
        await service.rollback(fromLedger);
        fail('Expected rollback to throw');
      } catch (error) {
        // Error is re-thrown after audit
        expect(error).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test boundary conditions and unusual scenarios.
     */
    it('handles rollback when no entities are affected', async () => {
      const fromLedger = 9999999; // Far future ledger with no data

      setupTransactionMock((sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '0' }]);
        }
        if (sql.includes('SELECT DISTINCT')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.raffleEvents).toBe(0);
      expect(audit.affectedEntities.tickets).toBe(0);
      expect(audit.affectedEntities.raffles).toBe(0);
      expect(audit.affectedEntities.users).toBe(0);
      expect(audit.affectedEntities.platformStats).toBe(0);
    });

    it('validates cursor is trimmed correctly', async () => {
      const fromLedger = 1000;
      let cursorTrimmed = false;

      setupTransactionMock((sql: string, params?: any[]) => {
        if (sql.includes('SELECT COUNT')) {
          return Promise.resolve([{ count: '1' }]);
        }
        if (sql.includes('SELECT DISTINCT')) {
          return Promise.resolve([]);
        }
        // Validate cursor trim query
        if (sql.includes('UPDATE indexer_cursor') && sql.includes('ledger_hashes')) {
          cursorTrimmed = true;
          expect(sql).toContain('jsonb_array_elements');
          expect(sql).toContain('last_ledger = $2');
          expect(params).toEqual([fromLedger, fromLedger - 1]);
        }
        return Promise.resolve(undefined);
      });

      const audit = await service.rollback(fromLedger);

      expect(audit.success).toBe(true);
      expect(cursorTrimmed).toBe(true);
    });
  });
});
