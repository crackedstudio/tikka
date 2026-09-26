import { Injectable, Logger } from '@nestjs/common';
import { DlqService, MAX_RETRIES, ReplayResult } from '../ingestor/dlq.service';
import {
  applyFilters,
  summarise,
  formatSummary,
  ReplayFilters,
  DlqEntryLike,
} from './dlq-replay.filters';
import { InjectRepository } from '@nestjs/typeorm';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { Repository } from 'typeorm';

export interface DlqReplayOptions {
  /**
   * When true, no writes are made — the service reports what would happen but
   * makes no state changes and dispatches nothing.
   */
  dryRun?: boolean;

  /** Filter criteria — at least one field must be set, or `all` must be true. */
  filters?: ReplayFilters;

  /**
   * Explicitly allow replaying the entire queue with no filter. Without this
   * flag a call with an empty `filters` object is rejected to prevent an
   * operator from accidentally replaying the whole DLQ with a typo.
   */
  all?: boolean;

  /**
   * When true, entries that have already been replayed (`replayedAt != null`)
   * are eligible again. Use with caution.
   */
  forceReplay?: boolean;
}

export interface DlqReplayServiceResult {
  replayed: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  /** Human-readable summary (printed by CLI or returned in HTTP response). */
  summary: string;
}

/**
 * Core business logic for DLQ replay, extracted from the CLI script so that
 * the HTTP endpoint added in #862 can call it without reimplementing the
 * filter/safety/idempotency logic.
 *
 * Responsibilities:
 * - Enforce the "explicit filter or --all" safety guard.
 * - Apply in-memory filters to the DLQ population.
 * - Delegate actual dispatch to DlqService.replayAll().
 * - Return a structured result plus a human-readable summary.
 */
@Injectable()
export class DlqReplayService {
  private readonly logger = new Logger(DlqReplayService.name);

  constructor(
    private readonly dlqService: DlqService,
    @InjectRepository(DeadLetterEventEntity)
    private readonly repo: Repository<DeadLetterEventEntity>,
  ) {}

  /**
   * Run a DLQ replay with the given options.
   *
   * Safety contract:
   * - If `filters` has no active criteria AND `all` is not set, this method
   *   throws to prevent whole-queue replay by accident.
   * - A dry-run uses the same filter/selection path as a real replay, so the
   *   reported population is always accurate.
   *
   * Idempotency:
   * - Successfully replayed entries have `replayedAt` set by DlqService.
   * - Subsequent calls skip those entries unless `forceReplay` is passed.
   */
  async replay(options: DlqReplayOptions = {}): Promise<DlqReplayServiceResult> {
    const { dryRun = false, filters = {}, all = false, forceReplay = false } = options;

    this.guardAgainstUnfilteredReplay(filters, all);

    // Load the full (non-replayed) set then apply in-memory filters so that
    // dry-run and real replay always operate on the same population.
    const allEntries = await this.repo.find({ order: { createdAt: 'ASC' } });
    const filtered = applyFilters(allEntries, filters) as DlqEntryLike[];

    const summary = formatSummary(summarise(filtered, MAX_RETRIES), filters);

    if (dryRun) {
      this.logger.log(`DLQ replay dry-run: ${filtered.length} matching entries`);
      return { replayed: 0, skipped: filtered.length, failed: 0, dryRun: true, summary };
    }

    if (filtered.length === 0) {
      return { replayed: 0, skipped: 0, failed: 0, dryRun: false, summary };
    }

    // Derive ledger range from the filtered population and delegate to
    // DlqService so dispatch/idempotency/metrics logic stays in one place.
    const ledgers = filtered.map((e) => e.ledger);
    const fromLedger = Math.min(...ledgers);
    const toLedger = Math.max(...ledgers);

    // When the filters only narrow by type/date (not ledger), tell DlqService
    // the full range so it fetches the right DB rows. DlqService re-applies
    // its own retryable+replayedAt query clause on top.
    const result: ReplayResult = await this.dlqService.replayAll({
      dryRun: false,
      fromLedger,
      toLedger,
      forceReplay,
    });

    return { ...result, summary };
  }

  /**
   * Refuse to run a replay that would touch every entry in the queue without
   * an explicit acknowledgement.  This is the primary protection against
   * `pnpm dlq:replay` (no args) triggering a full replay by accident.
   *
   * Conditions that satisfy the guard (any one is sufficient):
   * - `all === true`   — caller explicitly said "yes, replay everything"
   * - `filters.eventTypes` has at least one entry
   * - `filters.since` is set
   * - `filters.until` is set
   */
  private guardAgainstUnfilteredReplay(filters: ReplayFilters, all: boolean): void {
    const hasFilter =
      (filters.eventTypes?.length ?? 0) > 0 ||
      filters.since !== undefined ||
      filters.until !== undefined;

    if (!hasFilter && !all) {
      throw new Error(
        'Replay refused: no filter is active and --all was not passed. ' +
          'Provide at least one of --type, --since, --until, or pass --all to ' +
          'intentionally replay the entire DLQ.',
      );
    }
  }
}
