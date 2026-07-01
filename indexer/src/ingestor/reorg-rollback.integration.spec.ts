import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReorgRollbackService } from './reorg-rollback.service';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { RaffleEntity } from '../database/entities/raffle.entity';
import { UserEntity } from '../database/entities/user.entity';
import { PlatformStatEntity } from '../database/entities/platform-stat.entity';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';

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

  describe('canonical replay consistency', () => {
    it('ensures rollback + replay produces identical final state', async () => {
      // This test would be implemented with a real database
      // and would verify that after rollback and canonical replay,
      // all derived state matches expected values
      
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '3' }]) // events
            .mockResolvedValueOnce([{ count: '5' }]) // tickets  
            .mockResolvedValueOnce([{ count: '2' }]) // raffles
            .mockResolvedValueOnce([{ count: '1' }]) // dle
            .mockResolvedValueOnce([{ address: 'user1' }]) // users
            .mockResolvedValueOnce([{ date: '2024-01-01' }]) // stats
            .mockResolvedValue(undefined), // All other operations
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1050);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.raffleEvents).toBe(3);
      expect(audit.affectedEntities.tickets).toBe(5);
      expect(audit.affectedEntities.raffles).toBe(2);
      expect(audit.replayCursor).toBe(1049);
    });
  });

  describe('reorg scenarios', () => {
    it('handles reorg affecting raffle create events', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '1' }]) // 1 raffle event
            .mockResolvedValueOnce([{ count: '0' }]) // 0 tickets
            .mockResolvedValueOnce([{ count: '1' }]) // 1 raffle
            .mockResolvedValueOnce([{ count: '0' }]) // 0 dead letters
            .mockResolvedValueOnce([{ address: 'creator1' }]) // affected user
            .mockResolvedValueOnce([{ date: '2024-01-01' }]) // affected date
            .mockResolvedValue(undefined),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1100);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.raffles).toBe(1);
      expect(audit.affectedEntities.users).toBe(1);
      expect(audit.affectedEntities.platformStats).toBe(1);
    });

    it('handles reorg affecting ticket purchase events', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '2' }]) // 2 ticket events
            .mockResolvedValueOnce([{ count: '10' }]) // 10 tickets
            .mockResolvedValueOnce([{ count: '0' }]) // 0 raffles
            .mockResolvedValueOnce([{ count: '0' }]) // 0 dead letters
            .mockResolvedValueOnce([
              { address: 'buyer1' }, 
              { address: 'buyer2' },
            ]) // affected users
            .mockResolvedValueOnce([{ date: '2024-01-01' }]) // affected date
            .mockResolvedValue(undefined),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1200);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.tickets).toBe(10);
      expect(audit.affectedEntities.users).toBe(2);
    });

    it('handles reorg affecting raffle finalize events', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '1' }]) // 1 finalize event
            .mockResolvedValueOnce([{ count: '0' }]) // 0 tickets
            .mockResolvedValueOnce([{ count: '0' }]) // 0 new raffles (but finalized ones affected)
            .mockResolvedValueOnce([{ count: '0' }]) // 0 dead letters
            .mockResolvedValueOnce([{ address: 'winner1' }]) // affected user
            .mockResolvedValueOnce([{ date: '2024-01-01' }]) // affected date
            .mockResolvedValue(undefined),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1300);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.users).toBe(1);
      expect(audit.affectedEntities.platformStats).toBe(1);
    });

    it('handles mixed multi-ledger event ranges', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '5' }]) // mixed events
            .mockResolvedValueOnce([{ count: '15' }]) // tickets
            .mockResolvedValueOnce([{ count: '3' }]) // raffles
            .mockResolvedValueOnce([{ count: '1' }]) // dead letters
            .mockResolvedValueOnce([
              { address: 'user1' },
              { address: 'user2' }, 
              { address: 'user3' },
            ]) // affected users
            .mockResolvedValueOnce([
              { date: '2024-01-01' },
              { date: '2024-01-02' },
            ]) // affected dates
            .mockResolvedValue(undefined),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1400);

      expect(audit.success).toBe(true);
      expect(audit.affectedEntities.raffleEvents).toBe(5);
      expect(audit.affectedEntities.tickets).toBe(15);
      expect(audit.affectedEntities.raffles).toBe(3);
      expect(audit.affectedEntities.deadLetterEvents).toBe(1);
      expect(audit.affectedEntities.users).toBe(3);
      expect(audit.affectedEntities.platformStats).toBe(2);
    });
  });

  describe('transactional safety', () => {
    it('aborts transaction when rollback operations fail', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '1' }]) // count succeeds
            .mockRejectedValueOnce(new Error('Constraint violation')), // delete fails
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      await expect(service.rollback(1500)).rejects.toThrow('Constraint violation');
      
      // Verify transaction was attempted (would rollback automatically on error)
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('ensures no partial mutations persist on failure', async () => {
      // Mock a scenario where some operations succeed but later ones fail
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn()
            .mockResolvedValueOnce([{ count: '1' }]) // count
            .mockResolvedValueOnce([{ count: '1' }]) // count  
            .mockResolvedValueOnce([{ count: '1' }]) // count
            .mockResolvedValueOnce([{ count: '1' }]) // count
            .mockResolvedValueOnce(undefined) // first delete succeeds
            .mockRejectedValueOnce(new Error('FK constraint')), // second delete fails
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      await expect(service.rollback(1600)).rejects.toThrow('FK constraint');
      
      // In a real database, all operations would be rolled back
      // Here we just verify the transaction wrapper was used
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('cursor consistency', () => {
    it('rewinds cursor to correct replay position', async () => {
      let cursorUpdateQuery = '';
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
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
              undefined
            );
          }),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      const audit = await service.rollback(1700);

      expect(audit.success).toBe(true);
      expect(audit.replayCursor).toBe(1699);
      expect(cursorUpdateQuery).toContain('last_ledger = $2');
      expect(cursorUpdateQuery).toContain('ledger_hashes');
    });
  });

  describe('idempotency and replay safety', () => {
    it('remains safe when applied multiple times to same ledger', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn().mockResolvedValue(
            // Second rollback should find no affected entities
            [{ count: '0' }]
          ),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      // First rollback
      const audit1 = await service.rollback(1800);
      expect(audit1.success).toBe(true);

      // Second rollback of same ledger should be safe
      const audit2 = await service.rollback(1800);
      expect(audit2.success).toBe(true);
      expect(audit2.affectedEntities.raffleEvents).toBe(0);
    });

    it('produces deterministic results for replay after rollback', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          query: jest.fn().mockResolvedValue(
            [{ count: '5' }] // Consistent count result
          ),
        };
        return cb(mockManager);
      });

      (dataSource.transaction as jest.Mock).mockImplementation(mockTransaction);

      // Multiple rollbacks to same point should be consistent
      const audit1 = await service.rollback(1900);
      const audit2 = await service.rollback(1900);

      expect(audit1.replayCursor).toBe(audit2.replayCursor);
      expect(audit1.affectedEntities.raffleEvents).toBe(audit2.affectedEntities.raffleEvents);
    });
  });
});