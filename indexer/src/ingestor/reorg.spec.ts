import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CursorManagerService } from './cursor-manager.service';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';

function makeRepo(entity: Partial<IndexerCursorEntity> | null = null) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(entity),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  return {
    findOne: jest.fn().mockResolvedValue(entity),
    manager,
  };
}

describe('CursorManagerService', () => {
  let service: CursorManagerService;

  async function build(entity: Partial<IndexerCursorEntity> | null = null) {
    const repo = makeRepo(entity);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CursorManagerService,
        { provide: getRepositoryToken(IndexerCursorEntity), useValue: repo },
      ],
    }).compile();
    service = module.get<CursorManagerService>(CursorManagerService);
    return repo;
  }

  describe('getCursor', () => {
    it('returns null when no cursor row exists', async () => {
      await build(null);
      expect(await service.getCursor()).toBeNull();
    });

    it('returns cursor with ledgerHashes', async () => {
      await build({
        lastLedger: 1000,
        lastPagingToken: 'tok',
        ledgerHashes: [{ ledger: 999, hash: 'abc' }],
      });
      const cursor = await service.getCursor();
      expect(cursor?.lastLedger).toBe(1000);
      expect(cursor?.ledgerHashes).toHaveLength(1);
    });
  });

  describe('checkForReorg', () => {
    it('returns null when no stored hash for that ledger', async () => {
      await build({ lastLedger: 1000, ledgerHashes: [] });
      expect(await service.checkForReorg(1000, 'anyhash')).toBeNull();
    });

    it('returns null when hash matches', async () => {
      await build({
        lastLedger: 1000,
        ledgerHashes: [{ ledger: 1000, hash: 'correct' }],
      });
      expect(await service.checkForReorg(1000, 'correct')).toBeNull();
    });

    it('returns divergence ledger when hash differs', async () => {
      await build({
        lastLedger: 1000,
        ledgerHashes: [{ ledger: 1000, hash: 'original' }],
      });
      expect(await service.checkForReorg(1000, 'forked')).toBe(1000);
    });
  });

  describe('saveCursor', () => {
    it('appends new hash to the ring and upserts', async () => {
      const repo = await build({
        lastLedger: 999,
        ledgerHashes: [{ ledger: 999, hash: 'prev' }],
      });

      await service.saveCursor(1000, 'newhash', 'token-1');

      expect(repo.manager.upsert).toHaveBeenCalledWith(
        IndexerCursorEntity,
        expect.objectContaining({
          id: 1,
          lastLedger: 1000,
          lastPagingToken: 'token-1',
          ledgerHashes: [
            { ledger: 999, hash: 'prev' },
            { ledger: 1000, hash: 'newhash' },
          ],
        }),
        ['id'],
      );
    });
  });
});

// ---------------------------------------------------------------------------
// ReorgRollbackService
// ---------------------------------------------------------------------------
import { ReorgRollbackService } from './reorg-rollback.service';
import { DataSource } from 'typeorm';

describe('ReorgRollbackService', () => {
  let service: ReorgRollbackService;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn().mockResolvedValue(undefined);
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const manager = { query: queryMock };
        return cb(manager);
      }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorgRollbackService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<ReorgRollbackService>(ReorgRollbackService);
  });

  it('deletes raffle_events, tickets, and raffles from the reorg ledger onwards', async () => {
    await service.rollback(1050);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM raffle_events'),
      [1050],
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tickets'),
      [1050],
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM raffles'),
      [1050],
    );
  });

  it('trims ledger_hashes in the cursor to entries before the reorg point', async () => {
    await service.rollback(1050);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE indexer_cursor'),
      [1050],
    );
  });
});
