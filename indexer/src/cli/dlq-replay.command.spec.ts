/**
 * Tests for DlqReplayService — the portable core extracted from the DLQ replay
 * CLI (issue #1597).
 *
 * Acceptance criteria (from the issue):
 *  ✓ Replay of a single event succeeds and sets replayedAt.
 *  ✓ Filtered batch: only matching entries are dispatched.
 *  ✓ An event that fails again increments retryCount and records the error.
 *  ✓ Dry-run makes no writes and returns dryRun: true.
 *  ✓ A successfully replayed entry (replayedAt != null) is skipped on the next
 *    call — it cannot be replayed twice by accident.
 *  ✓ The command refuses to run without an explicit filter or --all.
 */

import { Repository } from 'typeorm';
import {
  DeadLetterEventEntity,
  DlqReason,
} from '../database/entities/dead-letter-event.entity';
import { IngestionDispatcherService } from '../ingestor/ingestion-dispatcher.service';
import { MAX_RETRIES } from '../ingestor/dlq.service';
import { DlqReplayService, NoFilterError } from './dlq-replay.service';
import type { ServiceReplayOptions } from './dlq-replay.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<DeadLetterEventEntity> = {},
): DeadLetterEventEntity {
  return {
    id: `uuid-${Math.random().toString(36).slice(2)}`,
    ledger: 1000,
    contractId: 'CXYZ',
    eventType: 'TicketPurchased',
    rawPayload: { ledger: 1000, type: 'TicketPurchased' },
    errorMessage: 'previous error',
    reason: DlqReason.HANDLER_ERROR,
    retryable: true,
    retryCount: 0,
    attemptCount: 1,
    replayedAt: null,
    createdAt: new Date('2026-07-15T00:00:00Z'),
    lastAttemptAt: new Date('2026-07-15T00:00:00Z'),
    ...overrides,
  } as DeadLetterEventEntity;
}

const SUCCEEDED_RESULT = {
  outcome: 'succeeded' as const,
  handlerName: 'TicketProcessor',
  eventId: 'e1',
  eventType: 'TicketPurchased',
  durationMs: 1,
};

/** Build minimal options that satisfy the safety guard. */
function opts(
  overrides: Partial<ServiceReplayOptions> = {},
): ServiceReplayOptions {
  return { filters: {}, all: true, dryRun: false, ...overrides };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DlqReplayService', () => {
  let repo: jest.Mocked<Repository<DeadLetterEventEntity>>;
  let dispatcher: jest.Mocked<Pick<IngestionDispatcherService, 'dispatch'>>;
  let service: DlqReplayService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (e) => e),
    } as any;

    dispatcher = {
      dispatch: jest.fn().mockResolvedValue(SUCCEEDED_RESULT),
    };

    service = new DlqReplayService(
      repo,
      dispatcher as unknown as IngestionDispatcherService,
    );

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Single-event success path
  // -------------------------------------------------------------------------

  describe('single event — success', () => {
    it('dispatches the entry and sets replayedAt', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
      expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(entry.replayedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('dispatches the event with the correct type from rawPayload', async () => {
      const entry = makeEntry({ eventType: 'RaffleCreated', rawPayload: { ledger: 200 } });
      repo.find.mockResolvedValue([entry]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      await promise;

      const [dispatchedEvent] = dispatcher.dispatch.mock.calls[0];
      expect(dispatchedEvent.type).toBe('RaffleCreated');
    });

    it('does not delete the entry after replay (idempotency guard relies on replayedAt)', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);
      const deleteMethod = jest.fn();
      (repo as any).delete = deleteMethod;

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      await promise;

      expect(deleteMethod).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Filtered batch
  // -------------------------------------------------------------------------

  describe('filtered batch', () => {
    // entries are recreated in beforeEach to avoid mutation leaking between tests.
    let entries: DeadLetterEventEntity[];

    beforeEach(() => {
      entries = [
        makeEntry({ id: 'a', eventType: 'TicketPurchased' }),
        makeEntry({ id: 'b', eventType: 'RaffleCreated' }),
        makeEntry({ id: 'c', eventType: 'TicketPurchased' }),
      ];
      repo.find.mockResolvedValue(entries);
    });

    it('only dispatches entries matching the type filter', async () => {
      const promise = service.replay(
        opts({ all: false, filters: { eventTypes: ['RaffleCreated'] } }),
      );
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(1);
      // Only the RaffleCreated entry (index 1) should be replayed.
      expect(entries[1].replayedAt).toBeInstanceOf(Date);
      expect(entries[0].replayedAt).toBeNull();
      expect(entries[2].replayedAt).toBeNull();
    });

    it('dispatches all entries when no type filter is set (--all)', async () => {
      const promise = service.replay(opts({ all: true, filters: {} }));
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(3);
      expect(dispatcher.dispatch).toHaveBeenCalledTimes(3);
    });

    it('applies since filter — entries before the cutoff are untouched', async () => {
      const since = new Date('2026-07-20T00:00:00Z');
      const newer = makeEntry({
        id: 'newer',
        eventType: 'TicketPurchased',
        createdAt: new Date('2026-07-25T00:00:00Z'),
      });
      const older = makeEntry({
        id: 'older',
        eventType: 'TicketPurchased',
        createdAt: new Date('2026-07-10T00:00:00Z'),
      });
      repo.find.mockResolvedValue([older, newer]);

      const promise = service.replay(opts({ all: false, filters: { since } }));
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(1);
      expect(newer.replayedAt).toBeInstanceOf(Date);
      expect(older.replayedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Failure path
  // -------------------------------------------------------------------------

  describe('event that fails again', () => {
    it('increments retryCount and preserves the new error message', async () => {
      const entry = makeEntry({ retryCount: 1 });
      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockRejectedValue(new Error('still broken'));

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.failed).toBe(1);
      expect(result.replayed).toBe(0);
      expect(entry.retryCount).toBe(2);
      expect(entry.errorMessage).toBe('still broken');
      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('counts a failed outcome from the dispatcher as a failure', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockResolvedValue({
        ...SUCCEEDED_RESULT,
        outcome: 'failed' as const,
        error: new Error('handler rejected'),
      });

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.failed).toBe(1);
      expect(entry.retryCount).toBe(1);
    });

    it('does not set replayedAt on a failing entry', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);
      dispatcher.dispatch.mockRejectedValue(new Error('boom'));

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      await promise;

      expect(entry.replayedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Dry-run
  // -------------------------------------------------------------------------

  describe('dry-run', () => {
    it('makes no dispatch calls', async () => {
      repo.find.mockResolvedValue([makeEntry(), makeEntry()]);

      const result = await service.replay(opts({ dryRun: true }));

      expect(result.dryRun).toBe(true);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('makes no saves', async () => {
      repo.find.mockResolvedValue([makeEntry()]);

      await service.replay(opts({ dryRun: true }));

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns zero counts for all outcome buckets', async () => {
      repo.find.mockResolvedValue([makeEntry(), makeEntry()]);

      const result = await service.replay(opts({ dryRun: true }));

      expect(result.replayed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skippedAlreadyReplayed).toBe(0);
      expect(result.skippedExhausted).toBe(0);
    });

    it('includes the summary string describing the matched population', async () => {
      repo.find.mockResolvedValue([
        makeEntry({ eventType: 'TicketPurchased' }),
        makeEntry({ eventType: 'TicketPurchased' }),
      ]);

      const result = await service.replay(opts({ dryRun: true }));

      expect(result.summary).toContain('Total matching:  2');
      expect(result.summary).toMatch(/TicketPurchased\s+2/);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency guard — cannot replay twice by accident
  // -------------------------------------------------------------------------

  describe('replayedAt idempotency guard', () => {
    it('skips entries that were already successfully replayed', async () => {
      const alreadyReplayed = makeEntry({ replayedAt: new Date('2026-07-10T00:00:00Z') });
      repo.find.mockResolvedValue([alreadyReplayed]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(0);
      expect(result.skippedAlreadyReplayed).toBe(1);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('does not modify replayedAt on a skipped entry', async () => {
      const originalDate = new Date('2026-07-10T00:00:00Z');
      const alreadyReplayed = makeEntry({ replayedAt: originalDate });
      repo.find.mockResolvedValue([alreadyReplayed]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      await promise;

      // The original timestamp must be preserved — it is the record that
      // the event was successfully processed.
      expect(alreadyReplayed.replayedAt).toEqual(originalDate);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows a second dispatch when forceReplay=true', async () => {
      const alreadyReplayed = makeEntry({ replayedAt: new Date('2026-07-10T00:00:00Z') });
      repo.find.mockResolvedValue([alreadyReplayed]);

      const promise = service.replay(opts({ forceReplay: true }));
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(1);
      expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('a successful replay in one call is skipped in the next call without forceReplay', async () => {
      const entry = makeEntry();
      repo.find.mockResolvedValue([entry]);

      // First call — succeeds and sets replayedAt.
      const firstPromise = service.replay(opts());
      await jest.runAllTimersAsync();
      await firstPromise;
      expect(entry.replayedAt).toBeInstanceOf(Date);

      // Second call — the same entry is still in the repo mock.
      dispatcher.dispatch.mockClear();
      const secondPromise = service.replay(opts());
      await jest.runAllTimersAsync();
      const secondResult = await secondPromise;

      expect(secondResult.skippedAlreadyReplayed).toBe(1);
      expect(secondResult.replayed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Exhaustion guard
  // -------------------------------------------------------------------------

  describe('exhausted entries', () => {
    it('skips entries at or above MAX_RETRIES', async () => {
      const exhausted = makeEntry({ retryCount: MAX_RETRIES });
      repo.find.mockResolvedValue([exhausted]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.skippedExhausted).toBe(1);
      expect(result.replayed).toBe(0);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('does not touch replayedAt or retryCount on an exhausted entry', async () => {
      const exhausted = makeEntry({ retryCount: MAX_RETRIES, replayedAt: null });
      repo.find.mockResolvedValue([exhausted]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      await promise;

      expect(exhausted.replayedAt).toBeNull();
      expect(exhausted.retryCount).toBe(MAX_RETRIES); // unchanged
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Safety guard — no filter / no --all
  // -------------------------------------------------------------------------

  describe('safety guard — refuse without filter or --all', () => {
    it('throws NoFilterError when neither a filter nor --all is provided', async () => {
      // No DB read should happen; the error is synchronous.
      await expect(
        service.replay({ filters: {}, all: false }),
      ).rejects.toThrow(NoFilterError);

      expect(repo.find).not.toHaveBeenCalled();
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('throws when eventTypes is explicitly empty and --all is absent', async () => {
      // An empty type array means "no filter" to applyFilters, so it must
      // also be rejected by the guard — otherwise the intent is ambiguous.
      await expect(
        service.replay({ filters: { eventTypes: [] }, all: false }),
      ).rejects.toThrow(NoFilterError);
    });

    it('does not throw when --all is true with no other filters', async () => {
      repo.find.mockResolvedValue([]);

      await expect(
        service.replay({ filters: {}, all: true }),
      ).resolves.not.toThrow();
    });

    it('does not throw when a type filter is set without --all', async () => {
      repo.find.mockResolvedValue([]);

      await expect(
        service.replay({ filters: { eventTypes: ['TicketPurchased'] }, all: false }),
      ).resolves.not.toThrow();
    });

    it('the error message directs the operator to --all', async () => {
      await expect(
        service.replay({ filters: {}, all: false }),
      ).rejects.toThrow(/--all/);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed batch — pending + already-replayed + exhausted
  // -------------------------------------------------------------------------

  describe('mixed batch', () => {
    it('counts each outcome bucket independently', async () => {
      const pending = makeEntry({ id: 'pending', retryCount: 0, replayedAt: null });
      const alreadyDone = makeEntry({
        id: 'done',
        retryCount: 0,
        replayedAt: new Date(),
      });
      const exhausted = makeEntry({
        id: 'exhausted',
        retryCount: MAX_RETRIES,
        replayedAt: null,
      });
      repo.find.mockResolvedValue([pending, alreadyDone, exhausted]);

      const promise = service.replay(opts());
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.replayed).toBe(1);
      expect(result.skippedAlreadyReplayed).toBe(1);
      expect(result.skippedExhausted).toBe(1);
      expect(result.failed).toBe(0);
      expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Summary string
  // -------------------------------------------------------------------------

  describe('summary output', () => {
    it('always returns a non-empty summary string', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.replay(opts());

      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('summary describes the filtered population, not total rows', async () => {
      const ticket = makeEntry({ eventType: 'TicketPurchased' });
      const raffle = makeEntry({ eventType: 'RaffleCreated' });
      repo.find.mockResolvedValue([ticket, raffle]);

      const promise = service.replay(
        opts({ all: false, filters: { eventTypes: ['TicketPurchased'] } }),
      );
      await jest.runAllTimersAsync();
      const result = await promise;

      // The summary covers only the 1 TicketPurchased that matched the filter.
      expect(result.summary).toContain('Total matching:  1');
      expect(result.summary).not.toContain('RaffleCreated');
    });
  });
});
