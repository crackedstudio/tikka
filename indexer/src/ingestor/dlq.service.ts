import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { DeadLetterEventEntity, DlqReason } from '../database/entities/dead-letter-event.entity';
import { DomainEvent } from './event.types';
import { IngestionDispatcherService } from './ingestion-dispatcher.service';

export { DlqReason };

export const MAX_RETRIES = 5;

/** Base delay in ms for exponential back-off: delay = BASE_DELAY_MS * 2^retryCount */
const BASE_DELAY_MS = 1_000;

/**
 * Map from DlqReason to whether automatic replay should be attempted.
 *
 * - PARSE_ERROR / SCHEMA_UNSUPPORTED → not retryable (a code fix is needed first).
 * - HANDLER_ERROR → retryable (handler may be idempotent or the error transient).
 * - DB_TRANSIENT → retryable (connection issues are usually self-healing).
 */
const REASON_RETRYABLE: Record<DlqReason, boolean> = {
  [DlqReason.PARSE_ERROR]: false,
  [DlqReason.HANDLER_ERROR]: true,
  [DlqReason.DB_TRANSIENT]: true,
  [DlqReason.SCHEMA_UNSUPPORTED]: false,
};

export interface ReplayOptions {
  /** When true, no writes are made — the command logs what would happen. */
  dryRun?: boolean;
  /** Only replay entries where `ledger` is >= fromLedger. */
  fromLedger?: number;
  /** Only replay entries where `ledger` is <= toLedger. */
  toLedger?: number;
  /**
   * When true, entries that have already been replayed (`replayedAt != null`)
   * are eligible again. Use with caution.
   */
  forceReplay?: boolean;
}

export interface ReplayResult {
  replayed: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
}

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DeadLetterEventEntity)
    private readonly repo: Repository<DeadLetterEventEntity>,
    private readonly dispatcher: IngestionDispatcherService,
  ) {}

  /**
   * Enqueue a failed event in the DLQ with a classified reason and retryability flag.
   *
   * @param event     The domain event that failed.
   * @param rawEvent  The raw ledger payload (preserved for replay context).
   * @param error     The error that caused the failure.
   * @param reason    Why the event failed. Defaults to HANDLER_ERROR.
   */
  async insert(
    event: DomainEvent,
    rawEvent: Record<string, unknown>,
    error: unknown,
    reason: DlqReason = DlqReason.HANDLER_ERROR,
  ): Promise<void> {
    const ledger = Number(rawEvent['ledger'] ?? 0);
    const contractId = (rawEvent['contractId'] as string | undefined) ?? null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryable = REASON_RETRYABLE[reason];

    await this.repo.save(
      this.repo.create({
        ledger,
        contractId,
        eventType: event.type,
        rawPayload: rawEvent,
        errorMessage,
        reason,
        retryable,
        retryCount: 0,
        replayedAt: null,
      }),
    );

    this.logger.warn(
      `DLQ [${reason}] stored ${event.type} at ledger ${ledger} (retryable=${retryable}): ${errorMessage}`,
    );
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  /**
   * Replay all eligible DLQ entries, optionally scoped to a ledger range.
   *
   * Eligibility rules (applied in order):
   * 1. `retryable` must be `true` (PARSE_ERROR and SCHEMA_UNSUPPORTED are excluded).
   * 2. `retryCount` must be < MAX_RETRIES.
   * 3. `replayedAt` must be null unless `forceReplay` is set.
   * 4. If `fromLedger` / `toLedger` are provided, `ledger` must be within range.
   *
   * Idempotency: successful replays set `replayedAt` to the current timestamp.
   * Subsequent calls will skip those entries unless `forceReplay` is passed.
   *
   * Dry-run: when `dryRun` is true the method logs each eligible entry and
   * returns counts, but makes no state changes.
   */
  async replayAll(options: ReplayOptions = {}): Promise<ReplayResult> {
    const { dryRun = false, fromLedger, toLedger, forceReplay = false } = options;

    const where: FindOptionsWhere<DeadLetterEventEntity> = {
      retryable: true,
      ...(forceReplay ? {} : { replayedAt: IsNull() }),
      ...(fromLedger !== undefined && toLedger !== undefined
        ? { ledger: Between(fromLedger, toLedger) }
        : fromLedger !== undefined
        ? { ledger: Between(fromLedger, Number.MAX_SAFE_INTEGER) }
        : toLedger !== undefined
        ? { ledger: Between(0, toLedger) }
        : {}),
    };

    const entries = await this.repo.find({ where, order: { ledger: 'ASC', createdAt: 'ASC' } });
    const eligible = entries.filter((e) => e.retryCount < MAX_RETRIES);

    let replayed = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of eligible) {
      if (dryRun) {
        this.logger.log(
          `DLQ dry-run: would replay ${entry.eventType} ledger=${entry.ledger} id=${entry.id} (reason=${entry.reason} retries=${entry.retryCount})`,
        );
        skipped++;
        continue;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, entry.retryCount);
      await sleep(delay);

      try {
        const event = { ...entry.rawPayload, type: entry.eventType } as DomainEvent;
        const result = await this.dispatcher.dispatch(event, entry.rawPayload);
        if (result.outcome === 'failed') {
          throw result.error ?? new Error(`Replay failed for ${entry.eventType}`);
        }
        // Mark as successfully replayed (idempotency guard)
        entry.replayedAt = new Date();
        await this.repo.save(entry);
        replayed++;
        this.logger.log(`DLQ: replayed ${entry.eventType} ledger=${entry.ledger} id=${entry.id}`);
      } catch (err) {
        entry.retryCount += 1;
        entry.errorMessage = err instanceof Error ? err.message : String(err);
        await this.repo.save(entry);
        failed++;
        this.logger.warn(
          `DLQ: retry ${entry.retryCount}/${MAX_RETRIES} failed for ${entry.eventType} id=${entry.id}: ${entry.errorMessage}`,
        );
      }
    }

    this.logger.log(
      `DLQ replay complete${dryRun ? ' (dry-run)' : ''}: replayed=${replayed} skipped=${skipped} failed=${failed}`,
    );
    return { replayed, skipped, failed, dryRun };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
