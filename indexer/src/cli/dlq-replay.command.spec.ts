/**
 * Tests for DlqReplayService — the extracted core of the DLQ replay CLI.
 *
 * Acceptance criteria (issue #1597):
 * 1. Replay of a single event succeeds and marks replayedAt on the entry.
 * 2. A filtered batch replays only the matching subset.
 * 3. An event that fails again increments retryCount; a subsequently exhausted
 *    entry is skipped.
 * 4. Dry-run mode reports the same population but makes no state changes.
 *
 * Plus the safety invariants:
 * - replayed_at is set on success → entry cannot be replayed a second time
 *   unless forceReplay is passed.
 * - The service refuses to run with no filter and no --all flag, so an
 *   operator cannot replay the entire DLQ by typo.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqReplayService } from './dlq-replay.service';
import { DlqService, MAX_RETRIES } from '../ingestor/dlq.service';
import { DeadLetterEventEntity, DlqReason } from '../database/entities/dead-letter-event.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal DeadLetterEventEntity with sensible defaults. */
function makeEntry(overrides: Partial<DeadLetterEventEntity> = {}): DeadLetterEventEntity {
  return {
    id: `uuid-${Math.random().toString(36).slice(2, 10)}`,
    ledger: 1000,
    contractId: 'CXYZ',
    eventType: 'TicketPurchased',
    rawPayload: { ledger: 1000 },
    errorMessage: 'previous error',
    reason: DlqReason.HANDLER_ERROR,
    retryable: true,
    retryCount: 0,
    attemptCount: 1,
    replayedAt: null,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    lastAttemptAt: new Date('2026-07-10T00:00:00Z'),
    ...overrides,
  } as DeadLetterEventEntity;
}

/** Minimal successful ReplayResult returned by DlqService. */
function successResult(replayed = 1) {
  return { replayed, skipped: 0, failed: 0, dryRun: false };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DlqReplayService', () => {
  let service: DlqReplayService;
  let dlqService: jest.Mocked<Pick<DlqService, 'replayAll'>>;
  let repo: jest.Mocked<Pick<Repository<DeadLetterEventEntity>, 'find'>>;

  beforeEach(async () => {
    dlqService = {
      replayAll: jest.fn().mockResolvedValue(successResult(1)),
    };

    repo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqReplayService,
        { provide: DlqService, useValue: dlqService },
        {
          provide: getRepositoryToken(DeadLetterEventEntity),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get(DlqReplayService);
  });

  // -------------------------------------------------------------------------
  // 1. Single-event replay
  // -------------------------------------------------------------------------

  describe('single-event replay', () => {
    it('calls DlqService.replayAll with the correct ledger range', async () => {
      const entry = makeEntry({ ledger: 500 });
      repo.find.mockResolvedValue([entry]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      const result = await service.replay({
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(dlqService.replayAll).toHaveBeenCalledWith(
        expect.objectContaining({ fromLedger: 500, toLedger: 500 }),
      );
      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('includes a human-readable summary in the result', async () => {
      const entry = makeEntry({ eventType: 'RaffleCreated', ledger: 100 });
      repo.find.mockResolvedValue([entry]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      const result = await service.replay({
        filters: { eventTypes: ['RaffleCreated'] },
      });

      expect(result.summary).toContain('RaffleCreated');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Filtered-batch replay
  // -------------------------------------------------------------------------

  describe('filtered-batch replay', () => {
    const entries = [
      makeEntry({ id: 'a', eventType: 'TicketPurchased', ledger: 100 }),
      makeEntry({ id: 'b', eventType: 'RaffleCreated', ledger: 200 }),
      makeEntry({ id: 'c', eventType: 'TicketPurchased', ledger: 300 }),
    ];

    it('passes the ledger span of the filtered subset to DlqService', async () => {
      // Repo returns all three; the service applies an in-memory type filter
      // then feeds the min/max ledger of the *matching* set to replayAll.
      repo.find.mockResolvedValue(entries);
      dlqService.replayAll.mockResolvedValue(successResult(2));

      await service.replay({ filters: { eventTypes: ['TicketPurchased'] } });

      // Only entries a (100) and c (300) match → fromLedger=100, toLedger=300.
      expect(dlqService.replayAll).toHaveBeenCalledWith(
        expect.objectContaining({ fromLedger: 100, toLedger: 300 }),
      );
    });

    it('does not call DlqService when nothing matches the filter', async () => {
      repo.find.mockResolvedValue(entries);

      const result = await service.replay({
        filters: { eventTypes: ['UnknownEventType'] },
      });

      expect(dlqService.replayAll).not.toHaveBeenCalled();
      expect(result.replayed).toBe(0);
    });

    it('filters by date range and passes the correct ledger span', async () => {
      // Use entries that span a date range so the since filter actually narrows
      // the set and the ledger range calculation is exercised.
      const datedEntries = [
        makeEntry({
          id: 'x',
          eventType: 'TicketPurchased',
          ledger: 50,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        }),
        makeEntry({
          id: 'y',
          eventType: 'TicketPurchased',
          ledger: 200,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        }),
        makeEntry({
          id: 'z',
          eventType: 'TicketPurchased',
          ledger: 300,
          createdAt: new Date('2026-09-01T00:00:00Z'),
        }),
      ];
      repo.find.mockResolvedValue(datedEntries);
      dlqService.replayAll.mockResolvedValue(successResult(2));

      await service.replay({
        filters: { since: new Date('2026-07-15T00:00:00Z') },
        // since is an active filter so no --all flag is needed
      });

      // Only entries y (ledger=200) and z (ledger=300) are on or after 2026-07-15.
      expect(dlqService.replayAll).toHaveBeenCalledWith(
        expect.objectContaining({ fromLedger: 200, toLedger: 300 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Event that fails again — retry-count mechanics
  // -------------------------------------------------------------------------

  describe('event that fails again', () => {
    it('reports the failed count returned by DlqService', async () => {
      const entry = makeEntry({ retryCount: 1 });
      repo.find.mockResolvedValue([entry]);
      dlqService.replayAll.mockResolvedValue({ replayed: 0, skipped: 0, failed: 1, dryRun: false });

      const result = await service.replay({
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(result.failed).toBe(1);
      expect(result.replayed).toBe(0);
    });

    it('passes an exhausted entry (retryCount >= MAX_RETRIES) through to DlqService', async () => {
      // DlqService itself is responsible for skipping exhausted entries;
      // DlqReplayService should not double-gate.  Passing forceReplay lets
      // the caller override that at both layers.
      const exhausted = makeEntry({ retryCount: MAX_RETRIES });
      repo.find.mockResolvedValue([exhausted]);
      dlqService.replayAll.mockResolvedValue({ replayed: 0, skipped: 0, failed: 0, dryRun: false });

      const result = await service.replay({
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(dlqService.replayAll).toHaveBeenCalled();
      expect(result.replayed).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Dry-run mode
  // -------------------------------------------------------------------------

  describe('dry-run mode', () => {
    it('does not call DlqService.replayAll in dry-run mode', async () => {
      const entry = makeEntry({ eventType: 'TicketPurchased' });
      repo.find.mockResolvedValue([entry]);

      const result = await service.replay({
        dryRun: true,
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(dlqService.replayAll).not.toHaveBeenCalled();
      expect(result.dryRun).toBe(true);
      expect(result.replayed).toBe(0);
    });

    it('counts matching entries as skipped in dry-run', async () => {
      const entries = [
        makeEntry({ id: 'a', eventType: 'TicketPurchased' }),
        makeEntry({ id: 'b', eventType: 'TicketPurchased' }),
      ];
      repo.find.mockResolvedValue(entries);

      const result = await service.replay({
        dryRun: true,
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(result.skipped).toBe(2);
    });

    it('includes the filter summary even when no entries match', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.replay({
        dryRun: true,
        filters: { eventTypes: ['RaffleFinalized'] },
      });

      expect(result.summary).toContain('RaffleFinalized');
      expect(result.replayed).toBe(0);
    });

    it('dry-run summary describes the same population as a real replay would touch', async () => {
      // The core accuracy requirement from issue #1109 (carried forward here):
      // a dry-run must operate on the same filtered set as a real run so the
      // operator can trust the report.
      const entries = [
        makeEntry({ id: 'a', eventType: 'TicketPurchased' }),
        makeEntry({ id: 'b', eventType: 'RaffleCreated' }),
      ];
      repo.find.mockResolvedValue(entries);

      const dryResult = await service.replay({
        dryRun: true,
        filters: { eventTypes: ['TicketPurchased'] },
      });

      // skipped = 1 (only TicketPurchased matched)
      expect(dryResult.skipped).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // replayed_at — idempotency guard
  // -------------------------------------------------------------------------

  describe('replayed_at idempotency guard', () => {
    it('does not replay an already-replayed entry (repo filters it out)', async () => {
      // The real repo query uses replayedAt IS NULL; in this unit test we
      // simulate that by returning only unreplayed entries from find().
      repo.find.mockResolvedValue([]);

      const result = await service.replay({
        filters: { eventTypes: ['TicketPurchased'] },
      });

      expect(dlqService.replayAll).not.toHaveBeenCalled();
      expect(result.replayed).toBe(0);
    });

    it('passes forceReplay through to DlqService', async () => {
      const alreadyReplayed = makeEntry({ replayedAt: new Date('2026-07-01') });
      repo.find.mockResolvedValue([alreadyReplayed]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      await service.replay({
        filters: { eventTypes: ['TicketPurchased'] },
        forceReplay: true,
      });

      expect(dlqService.replayAll).toHaveBeenCalledWith(
        expect.objectContaining({ forceReplay: true }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Safety guard — refuse without explicit filter or --all
  // -------------------------------------------------------------------------

  describe('safety guard', () => {
    it('throws when no filter is provided and all is not set', async () => {
      repo.find.mockResolvedValue([makeEntry()]);

      await expect(service.replay({})).rejects.toThrow(
        /no filter is active and --all was not passed/,
      );
      expect(dlqService.replayAll).not.toHaveBeenCalled();
    });

    it('throws with empty filters object (same as no options)', async () => {
      repo.find.mockResolvedValue([makeEntry()]);

      await expect(service.replay({ filters: {} })).rejects.toThrow(/no filter is active/);
    });

    it('throws even in dry-run mode without a filter (dry-run is not a bypass)', async () => {
      repo.find.mockResolvedValue([makeEntry()]);

      await expect(service.replay({ dryRun: true })).rejects.toThrow(/no filter is active/);
    });

    it('allows a filterless replay when all=true', async () => {
      repo.find.mockResolvedValue([makeEntry()]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      await expect(service.replay({ all: true })).resolves.not.toThrow();
    });

    it('allows replay when eventTypes filter is set', async () => {
      repo.find.mockResolvedValue([makeEntry()]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      await expect(
        service.replay({ filters: { eventTypes: ['TicketPurchased'] } }),
      ).resolves.not.toThrow();
    });

    it('allows replay when only a since filter is set', async () => {
      repo.find.mockResolvedValue([makeEntry()]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      await expect(
        service.replay({ filters: { since: new Date('2026-01-01') } }),
      ).resolves.not.toThrow();
    });

    it('allows replay when only an until filter is set', async () => {
      repo.find.mockResolvedValue([makeEntry()]);
      dlqService.replayAll.mockResolvedValue(successResult(1));

      await expect(
        service.replay({ filters: { until: new Date('2026-12-31') } }),
      ).resolves.not.toThrow();
    });
  });
});
