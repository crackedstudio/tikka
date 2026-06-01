/**
 * cursor-manager.service.ts
 *
 * Manages the singleton cursor row (id=1) in the indexer_cursor table.
 *
 * Changes in issue #560:
 *  - Added IngestorMode ("RUNNING" | "DEGRADED" | "STOPPED")
 *  - validateOnLoad() called in getCursor(); violation → DEGRADED, no loop start
 *  - validateBeforeSave() called in saveCursor(); violation → DEGRADED + throws
 *  - validateLedgerHash() exposed via checkForReorg() (existing callers unchanged)
 *  - getStatus() exposes mode, lastCheckpoint, lastViolation, uptimeMs
 *  - CursorIntegrityError typed error class for callers to catch
 *
 * Storage: TypeORM upsert on IndexerCursorEntity (PostgreSQL, singleton row id=1).
 * The existing IndexerCursor interface and saveCursor/getCursor signatures are
 * preserved for backward compatibility with LedgerPollerService.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, QueryRunner } from 'typeorm';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import {
  CursorCheckpoint,
  CURSOR_CHECKPOINT_VERSION,
  IntegrityViolation,
  validateBeforeSave,
  validateLedgerHash,
  validateOnLoad,
} from './cursor-integrity';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Operational mode of the ingestion pipeline.
 *
 * RUNNING  — normal operation.
 * DEGRADED — integrity violation detected; ingestion paused, no writes.
 *            Operator action required to clear or reset.
 * STOPPED  — clean shutdown.
 */
export type IngestorMode = 'RUNNING' | 'DEGRADED' | 'STOPPED';

export interface CursorManagerStatus {
  /** Current operational mode of the ingestion pipeline. */
  mode: IngestorMode;
  /**
   * The last checkpoint that was successfully validated and persisted.
   * null if no checkpoint has been written or loaded in this process lifetime.
   */
  lastCheckpoint: CursorCheckpoint | null;
  /**
   * The most recent integrity violation that caused a DEGRADED transition.
   * null while mode is RUNNING or STOPPED.
   */
  lastViolation: IntegrityViolation | null;
  /** Milliseconds since this CursorManagerService instance was constructed. */
  uptimeMs: number;
}

/**
 * Thrown when a cursor integrity check fails.
 * The ingestor must catch this and transition to DEGRADED mode.
 */
export class CursorIntegrityError extends Error {
  constructor(
    public readonly violation: IntegrityViolation,
    public readonly checkpoint: Partial<CursorCheckpoint>,
  ) {
    super(`Cursor integrity violation: ${violation.code}`);
    this.name = 'CursorIntegrityError';
  }
}

/** Legacy shape returned by getCursor() — unchanged for backward compat. */
export interface IndexerCursor {
  lastLedger: number;
  lastPagingToken?: string;
  ledgerHashes: Array<{ ledger: number; hash: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HASH_RING_SIZE = 200;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CursorManagerService {
  private readonly logger = new Logger(CursorManagerService.name);

  private mode: IngestorMode = 'RUNNING';
  private lastCheckpoint: CursorCheckpoint | null = null;
  private lastViolation: IntegrityViolation | null = null;
  private readonly startedAt = Date.now();

  constructor(
    @InjectRepository(IndexerCursorEntity)
    private readonly cursorRepo: Repository<IndexerCursorEntity>,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns a snapshot of the cursor manager's current state.
   *
   * - `mode`           — RUNNING (normal), DEGRADED (integrity violation, writes
   *                      blocked), or STOPPED (clean shutdown).
   * - `lastCheckpoint` — the last checkpoint successfully validated and written;
   *                      use this to determine the safe resume point.
   * - `lastViolation`  — the violation that triggered DEGRADED, if any; inspect
   *                      `violation.code` and the accompanying fields to diagnose
   *                      the root cause before attempting recovery.
   * - `uptimeMs`       — milliseconds since this service instance was created;
   *                      useful for correlating log timestamps.
   */
  getStatus(): CursorManagerStatus {
    return {
      mode: this.mode,
      lastCheckpoint: this.lastCheckpoint,
      lastViolation: this.lastViolation,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  /**
   * Load the cursor from storage.
   * Runs validateOnLoad(); on violation transitions to DEGRADED and returns null.
   * Callers (LedgerPollerService) must check getStatus().mode before starting.
   */
  async getCursor(): Promise<IndexerCursor | null> {
    this.logger.debug('Fetching cursor from storage...');
    const row = await this.cursorRepo.findOne({ where: { id: 1 } });
    if (!row || row.lastLedger === 0) return null;

    // Build a CursorCheckpoint from the stored row for validation
    const stored: CursorCheckpoint = {
      sequence: row.lastLedger,
      ledgerHash: row.ledgerHashes[row.ledgerHashes.length - 1]?.hash ?? '',
      processedEventCount: Number(row.processedEventCount),
      savedAt: row.savedAt instanceof Date ? row.savedAt.toISOString() : String(row.savedAt),
      version: row.checkpointVersion,
    };

    const violation = validateOnLoad(stored);
    if (violation) {
      this.transitionDegraded(violation);
      return null;
    }

    this.lastCheckpoint = stored;
    return {
      lastLedger: row.lastLedger,
      lastPagingToken: row.lastPagingToken,
      ledgerHashes: row.ledgerHashes,
    };
  }

  /**
   * Persist a new checkpoint.
   * Runs validateBeforeSave(); on violation transitions to DEGRADED and throws
   * CursorIntegrityError — the caller must not continue processing.
   *
   * @param ledger           Ledger sequence number being checkpointed.
   * @param ledgerHash       Hash of this ledger from the chain.
   * @param token            Horizon paging token (optional).
   * @param processedCount   Cumulative event count up to this ledger.
   * @param queryRunner      Optional QueryRunner for transactional saves.
   */
  async saveCursor(
    ledger: number,
    ledgerHash: string,
    token?: string,
    processedCount?: number,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    if (this.mode === 'DEGRADED') {
      this.logger.warn('saveCursor called while in DEGRADED mode — write suppressed');
      return;
    }

    const savedAt = new Date().toISOString();
    const eventCount = processedCount ?? (this.lastCheckpoint?.processedEventCount ?? 0);

    const candidate: CursorCheckpoint = {
      sequence: ledger,
      ledgerHash,
      processedEventCount: eventCount,
      savedAt,
      version: CURSOR_CHECKPOINT_VERSION,
    };

    const violation = validateBeforeSave(candidate, this.lastCheckpoint);
    if (violation) {
      this.transitionDegraded(violation);
      throw new CursorIntegrityError(violation, candidate);
    }

    this.logger.debug(
      `Saving cursor: ledger=${ledger}, hash=${ledgerHash}, events=${eventCount}, token=${token}`,
    );

    const manager: EntityManager = queryRunner
      ? queryRunner.manager
      : this.cursorRepo.manager;

    const existing = await manager.findOne(IndexerCursorEntity, { where: { id: 1 } });
    const hashes = existing?.ledgerHashes ?? [];
    hashes.push({ ledger, hash: ledgerHash });
    if (hashes.length > HASH_RING_SIZE) hashes.shift();

    await manager.upsert(
      IndexerCursorEntity,
      {
        id: 1,
        lastLedger: ledger,
        lastPagingToken: token ?? '',
        ledgerHashes: hashes,
        processedEventCount: eventCount,
        savedAt: new Date(savedAt),
        checkpointVersion: CURSOR_CHECKPOINT_VERSION,
      },
      ['id'],
    );

    this.lastCheckpoint = candidate;
  }

  /**
   * Check whether the chain-reported hash for a ledger matches the stored hash.
   * If the checkpoint for this sequence is the lastCheckpoint, also runs
   * validateLedgerHash() and transitions to DEGRADED on mismatch.
   *
   * Returns the divergence ledger number on reorg/mismatch, null otherwise.
   */
  async checkForReorg(ledger: number, expectedHash: string): Promise<number | null> {
    const cursor = await this.cursorRepo.findOne({ where: { id: 1 } });
    if (!cursor) return null;

    const stored = cursor.ledgerHashes.find((h) => h.ledger === ledger);
    if (!stored) return null;

    if (stored.hash !== expectedHash) {
      this.logger.warn(
        `Reorg detected at ledger ${ledger}: expected ${expectedHash}, got ${stored.hash}`,
      );

      // If this is the current checkpoint, run the typed integrity check too
      if (this.lastCheckpoint?.sequence === ledger) {
        const violation = validateLedgerHash(this.lastCheckpoint, expectedHash);
        if (violation) this.transitionDegraded(violation);
      }

      return ledger;
    }

    return null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private transitionDegraded(violation: IntegrityViolation): void {
    this.mode = 'DEGRADED';
    this.lastViolation = violation;
    this.logger.error('cursor_integrity_violation', {
      violation: violation.code,
      detail: violation,
      action: 'ingestion_paused_awaiting_operator',
    });
  }
}
