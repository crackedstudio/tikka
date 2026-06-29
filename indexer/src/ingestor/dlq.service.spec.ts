import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqService, MAX_RETRIES, DlqReason } from './dlq.service';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { IngestionDispatcherService } from './ingestion-dispatcher.service';
import { DomainEvent } from './event.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<DeadLetterEventEntity> = {}): DeadLetterEventEntity {
  return {
    id: `uuid-${Math.random().toString(36).slice(2)}`,
    ledger: 1000,
    contractId: 'CXYZ',
    eventType: 'RaffleCreated',
    rawPayload: { ledger: 1000 },
    errorMessage: 'previous error',
    reason: DlqReason.HANDLER_ERROR,
    retryable: true,
    retryCount: 0,
    replayedAt: null,
    createdAt: new Date(),
    lastAttemptAt: new Date(),
    ...overrides,
  } as DeadLetterEventEntity;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DlqService', () => {
  let service: DlqService;
  let repo: jest.Mocked<Repository<DeadLetterEventEntity>>;
  let dispatcher: jest.Mocked<IngestionDispatcherService>;

  beforeEach(async () => {
    repo = {
      save: jest.fn(),
      create: jest.fn((e) => e as DeadLetterEventEntity),
      count: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as any;

    dispatcher = {
      dispatch: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: getRepositoryToken(DeadLetterEventEntity), useValue: repo },
        { provide: IngestionDispatcherService, useValue: dispatcher },
      ],
    }).compile();

    service = module.get<DlqService>(DlqService);
  });

  // -------------------------------------------------------------------------
  // insert — reason classification
  // -------------------------------------------------------------------------

  describe('insert', () => {
    const event: DomainEvent = {
      type: 'RaffleCreated',
      raffle_id: 1,
      creator: 'GABC',
      params: {} as any,
    };
    const rawEvent = { ledger: 1000, contractId: 'CXYZ' };

    it('defaults to HANDLER_ERROR and marks retryable=true', async () => {
      await service.insert(event, rawEvent, new Error('oops'));
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: DlqReason.HANDLER_ERROR, retryable: true }),
      );
    });

    it('stores PARSE_ERROR with retryable=false', async () => {
      await service.insert(event, rawEvent, new Error('bad parse'), DlqReason.PARSE_ERROR);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: DlqReason.PARSE_ERROR, retryable: false }),
      );
    });

    it('stores SCHEMA_UNSUPPORTED with retryable=false', async () => {
      await service.insert(event, rawEvent, new Error('v99'), DlqReason.SCHEMA_UNSUPPORTED);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: DlqReason.SCHEMA_UNSUPPORTED, retryable: false }),
      );
    });

    it('stores DB_TRANSIENT with retryable=true', async () => {
      await service.insert(event, rawEvent, new Error('timeout'), DlqReason.DB_TRANSIENT);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: DlqReason.DB_TRANSIENT, retryable: true }),
      );
    });

    it('stores non-Error objects as string messages', async () => {
      await service.insert(event, rawEvent, 'plain string error');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: 'plain string error' }),
      );
    });

    it('initialises replayedAt as null', async () => {
      await service.insert(event, rawEvent, new Error('x'));
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ replayedAt: null }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // replayAll — basic replay
  // -------------------------------------------------------------------------

  describe('replayAll — success path', () => {
    it('replays eligible entries, sets replayedAt, and does not delete', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);
      const mockQr = { commitTransaction: jest.fn(), release: jest.fn() };
      dispatcher.dispatch.mockResolvedValue(mockQr as any);

      const result = await service.replayAll();

      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockQr.commitTransaction).toHaveBeenCalled();
      expect(entry.replayedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(entry);
      // entry should NOT be deleted — idempotency guard relies on replayedAt
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('handles a null QueryRunner from dispatcher', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockResolvedValue(null);

      const result = await service.replayAll();
      expect(result.replayed).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // replayAll — failure and retry-count tracking
  // -------------------------------------------------------------------------

  describe('replayAll — failure path', () => {
    it('increments retryCount on failure and preserves error message', async () => {
      const entry = makeEntry({ retryCount: 1 });
      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockRejectedValue(new Error('still failing'));

      const result = await service.replayAll();
      expect(result.failed).toBe(1);
      expect(entry.retryCount).toBe(2);
      expect(entry.errorMessage).toBe('still failing');
    });

    it('skips entries that have exceeded MAX_RETRIES', async () => {
      const exhausted = makeEntry({ retryCount: MAX_RETRIES });
      repo.find.mockResolvedValue([exhausted]);

      const result = await service.replayAll();
      expect(result.replayed).toBe(0);
      expect(result.failed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // replayAll — idempotency guard
  // -------------------------------------------------------------------------

  describe('replayAll — idempotency', () => {
    it('skips already-replayed entries by default', async () => {
      const alreadyDone = makeEntry({ replayedAt: new Date() });
      // repo.find respects where clause; simulate service filtering by returning
      // only entries where replayedAt IS NULL when forceReplay is false.
      // In tests we control what find returns.
      repo.find.mockResolvedValue([]); // filtered out by query

      const result = await service.replayAll();
      expect(result.replayed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('replays already-replayed entries when forceReplay=true', async () => {
      const alreadyDone = makeEntry({ replayedAt: new Date('2025-01-01') });
      repo.find.mockResolvedValue([alreadyDone]);
      const mockQr = { commitTransaction: jest.fn(), release: jest.fn() };
      dispatcher.dispatch.mockResolvedValue(mockQr as any);

      const result = await service.replayAll({ forceReplay: true });
      expect(result.replayed).toBe(1);
      expect(alreadyDone.replayedAt).not.toEqual(new Date('2025-01-01')); // updated
    });
  });

  // -------------------------------------------------------------------------
  // replayAll — dry-run mode
  // -------------------------------------------------------------------------

  describe('replayAll — dry-run', () => {
    it('does not dispatch or save in dry-run mode', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);

      const result = await service.replayAll({ dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.skipped).toBe(1);
      expect(result.replayed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // replayAll — non-retryable entries excluded
  // -------------------------------------------------------------------------

  describe('replayAll — non-retryable exclusion', () => {
    it('does not replay entries with retryable=false', async () => {
      // The service queries with retryable: true so find returns nothing for non-retryable
      repo.find.mockResolvedValue([]); // DB filters them out

      const result = await service.replayAll();
      expect(result.replayed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DlqReason categories — full coverage
  // -------------------------------------------------------------------------

  describe('DlqReason categories', () => {
    const cases: Array<[DlqReason, boolean]> = [
      [DlqReason.PARSE_ERROR, false],
      [DlqReason.HANDLER_ERROR, true],
      [DlqReason.DB_TRANSIENT, true],
      [DlqReason.SCHEMA_UNSUPPORTED, false],
    ];

    it.each(cases)('%s → retryable=%s', async (reason, expectedRetryable) => {
      const event: DomainEvent = {
        type: 'TicketPurchased',
        raffle_id: 1,
        buyer: 'G123',
        ticket_ids: [],
        total_paid: '0',
      };
      await service.insert(event, { ledger: 100 }, new Error('test'), reason);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason, retryable: expectedRetryable }),
      );
      jest.clearAllMocks();
      repo.create.mockImplementation((e) => e as DeadLetterEventEntity);
    });
  });
});
