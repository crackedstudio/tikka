/**
 * DlqReplayService — portable replay core for the DLQ replay CLI (issue #1597).
 *
 * Extracted from `dlq-replay.command.ts` so the same logic can be reused by
 * the upcoming HTTP endpoint (issue #862) without reimplementing it.
 *
 * Design constraints:
 *  - No NestJS DI: the CLI cannot bootstrap the full application context, so
 *    this service accepts plain constructor arguments rather than `@Inject()`
 *    decorators. The HTTP handler can instantiate it the same way once the
 *    TypeORM repository is in scope.
 *  - Filter purity: `applyFilters` is called once and the result is shared
 *    between dry-run and real-run paths, so both always operate on the same
 *    population (issue #1109).
 *  - No filter / no --all → hard refuse: replaying every event in the DLQ by
 *    accident is exactly the class of operator error this guard prevents.
 *    The guard lives in `dlq-replay.filters.ts` (`requireFilterOrAll`) and is
 *    the single enforcement point for both the CLI and the HTTP endpoint.
 */

import { Repository } from 'typeorm';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { DomainEvent } from '../ingestor/event.types';
import { IngestionDispatcherService } from '../ingestor/ingestion-dispatcher.service';
import { MAX_RETRIES } from '../ingestor/dlq.service';
import {
  applyFilters,
  summarise,
  formatSummary,
  requireFilterOrAll,
  type ReplayFilters,
} from './dlq-replay.filters';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ServiceReplayOptions {
  /** Restrict which DLQ entries are eligible. */
  filters: ReplayFilters;
  /** Pass `true` to process all entries when no filter is set. */
  all: boolean;
  /** Log the plan without making any writes. */
  dryRun?: boolean;
  /**
   * When true, entries that already carry a non-null `replayedAt` are
   * eligible again. Use only when an operator has confirmed they want to
   * re-run previously successful replays.
   */
  forceReplay?: boolean;
}

export interface ServiceReplayResult {
  replayed: number;
  failed: number;
  /** Count of entries skipped because they are already replayed (idempotency). */
  skippedAlreadyReplayed: number;
  /** Count of entries skipped because they are exhausted (retryCount >= MAX_RETRIES). */
  skippedExhausted: number;
  dryRun: boolean;
  /** The full summary text (same string the CLI prints). */
  summary: string;
}

// Re-export so callers can catch the guard error without knowing which module
// it originates from.
export { ArgumentError as NoFilterError } from './dlq-replay.filters';

// ---------------------------------------------------------------------------
// Back-off (mirrors DlqService constant, not re-exported from there)
// ---------------------------------------------------------------------------

const BASE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Core replay logic shared between the CLI command and the HTTP endpoint.
 *
 * `repo` and `dispatcher` are accepted as plain values so this class stays
 * instantiable without NestJS DI infrastructure.
 */
export class DlqReplayService {
  constructor(
    private readonly repo: Repository<DeadLetterEventEntity>,
    private readonly dispatcher: IngestionDispatcherService,
  ) {}

  /**
   * Replay DLQ entries that match `options.filters`.
   *
   * Throws `ArgumentError` (re-exported as `NoFilterError`) when neither a
   * filter is set nor `options.all` is true. This is the single enforcement
   * point for the safety guard, ensuring both the CLI and the HTTP endpoint
   * get identical behaviour automatically.
   */
  async replay(options: ServiceReplayOptions): Promise<ServiceReplayResult> {
    const { filters, all, dryRun = false, forceReplay = false } = options;

    // Throws ArgumentError when the guard is violated.
    requireFilterOrAll({ all, filters });

    // Fetch all entries and apply filters in memory. This mirrors the original
    // command behaviour and keeps dry-run / real-run on identical populations.
    const allEntries = await this.repo.find({ order: { createdAt: 'ASC' } });
    const entries = applyFilters(allEntries, filters);

    const summary = formatSummary(summarise(entries, MAX_RETRIES), filters);

    if (dryRun) {
      return {
        replayed: 0,
        failed: 0,
        skippedAlreadyReplayed: 0,
        skippedExhausted: 0,
        dryRun: true,
        summary,
      };
    }

    let replayed = 0;
    let failed = 0;
    let skippedAlreadyReplayed = 0;
    let skippedExhausted = 0;

    for (const entry of entries) {
      // Idempotency guard: skip entries that succeeded in a previous replay.
      if (!forceReplay && entry.replayedAt != null) {
        skippedAlreadyReplayed++;
        continue;
      }

      // Exhaustion guard: do not re-dispatch events that have hit the ceiling.
      if (entry.retryCount >= MAX_RETRIES) {
        skippedExhausted++;
        continue;
      }

      // Exponential back-off consistent with DlqService.replayAll().
      const delay = BASE_DELAY_MS * Math.pow(2, entry.retryCount);
      await sleep(delay);

      try {
        const event = { ...entry.rawPayload, type: entry.eventType } as DomainEvent;
        const result = await this.dispatcher.dispatch(
          event,
          entry.rawPayload as Record<string, unknown>,
        );

        if (result.outcome === 'failed') {
          throw result.error ?? new Error(`Replay failed for ${entry.eventType}`);
        }

        // Mark as successfully replayed (idempotency guard).
        entry.replayedAt = new Date();
        await this.repo.save(entry);
        replayed++;
      } catch (err) {
        entry.retryCount += 1;
        entry.errorMessage = err instanceof Error ? err.message : String(err);
        await this.repo.save(entry);
        failed++;
      }
    }

    return {
      replayed,
      failed,
      skippedAlreadyReplayed,
      skippedExhausted,
      dryRun: false,
      summary,
    };
  }
}
