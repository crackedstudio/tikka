/**
 * cursor-manager.service.ts
 *
 * Manages the singleton cursor row (id=1) in the indexer_cursor table.
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, QueryRunner, Repository } from "typeorm";
import { IndexerCursorEntity } from "../database/entities/indexer-cursor.entity";
import {
  CursorCheckpoint,
  CURSOR_CHECKPOINT_VERSION,
  CursorIntegrity,
  IntegrityViolation,
  validateBeforeSave,
  validateLedgerHash,
} from "./cursor-integrity";
import { PipelineStateMachine } from "./pipeline-state";

export type IngestorMode = "RUNNING" | "DEGRADED" | "STOPPED";

export interface IndexerCursor {
  lastLedger: number;
  lastPagingToken?: string;
  ledgerHashes: Array<{ ledger: number; hash: string }>;
}

export interface CursorManagerStatus {
  mode: IngestorMode;
  lastCheckpoint: CursorCheckpoint | null;
  lastViolation: IntegrityViolation | null;
  startupIntegrityPassed: boolean;
  uptimeMs: number;
}

export class CursorIntegrityError extends Error {
  constructor(
    public readonly violation: IntegrityViolation,
    public readonly checkpoint: CursorCheckpoint,
  ) {
    super(`Cursor integrity validation failed: ${violation.code}`);
    this.name = "CursorIntegrityError";
  }
}

const HASH_RING_SIZE = 200;

@Injectable()
export class CursorManagerService {
  private readonly logger = new Logger(CursorManagerService.name);

  private mode: IngestorMode = "RUNNING";
  private lastCheckpoint: CursorCheckpoint | null = null;
  private lastViolation: IntegrityViolation | null = null;
  private startupIntegrityPassed = true;
  private readonly startedAt = Date.now();

  constructor(
    @InjectRepository(IndexerCursorEntity)
    private readonly cursorRepo: Repository<IndexerCursorEntity>,
    @Optional() private readonly pipeline?: PipelineStateMachine,
  ) {}

  getStatus(): CursorManagerStatus {
    return {
      mode: this.mode,
      lastCheckpoint: this.lastCheckpoint,
      lastViolation: this.lastViolation,
      startupIntegrityPassed: this.startupIntegrityPassed,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  async validateStartupIntegrity(): Promise<void> {
    this.logger.debug("Validating cursor integrity on startup...");

    const row = await this.cursorRepo.findOne({ where: { id: 1 } });
    if (!row || row.lastLedger === 0) {
      this.startupIntegrityPassed = true;
      this.lastViolation = null;
      return;
    }

    const checkpoint = this.toCheckpoint(row);
    const violation = CursorIntegrity.validate(checkpoint);

    if (violation) {
      this.startupIntegrityPassed = false;
      this.transitionDegraded(violation);
      throw new CursorIntegrityError(violation, checkpoint);
    }

    this.startupIntegrityPassed = true;
    this.lastCheckpoint = checkpoint;
    this.lastViolation = null;
  }

  async getCursor(): Promise<IndexerCursor | null> {
    this.logger.debug("Fetching cursor from storage...");
    const row = await this.cursorRepo.findOne({ where: { id: 1 } });
    if (!row || row.lastLedger === 0) return null;

    const stored = this.toCheckpoint(row);
    const violation = CursorIntegrity.validate(stored);
    if (violation) {
      this.startupIntegrityPassed = false;
      this.transitionDegraded(violation);
      return null;
    }

    this.lastCheckpoint = stored;
    return {
      lastLedger: row.lastLedger,
      lastPagingToken: row.lastPagingToken,
      ledgerHashes: row.ledgerHashes ?? [],
    };
  }

  async saveCursor(
    ledger: number,
    ledgerHash: string,
    token?: string,
    processedCount?: number,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    if (this.mode === "DEGRADED") {
      this.logger.warn(
        "saveCursor called while in DEGRADED mode — write suppressed",
      );
      return;
    }

    const savedAt = new Date().toISOString();
    const eventCount =
      processedCount ?? this.lastCheckpoint?.processedEventCount ?? 0;

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

    const manager: EntityManager = queryRunner
      ? queryRunner.manager
      : this.cursorRepo.manager;
    const existing = await manager.findOne(IndexerCursorEntity, {
      where: { id: 1 },
    });
    const hashes = [
      ...(existing?.ledgerHashes ?? []),
      { ledger, hash: ledgerHash },
    ];
    while (hashes.length > HASH_RING_SIZE) {
      hashes.shift();
    }

    await manager.upsert(
      IndexerCursorEntity,
      {
        id: 1,
        lastLedger: ledger,
        lastPagingToken: token ?? "",
        ledgerHashes: hashes,
        processedEventCount: eventCount,
        savedAt: new Date(savedAt),
        checkpointVersion: CURSOR_CHECKPOINT_VERSION,
      },
      ["id"],
    );

    this.lastCheckpoint = candidate;
  }

  async checkForReorg(
    ledger: number,
    expectedHash: string,
  ): Promise<number | null> {
    const cursor = await this.cursorRepo.findOne({ where: { id: 1 } });
    if (!cursor) return null;

    const stored = (cursor.ledgerHashes ?? []).find(
      (entry: { ledger: number; hash: string }) => entry.ledger === ledger,
    );
    if (!stored) return null;

    if (stored.hash !== expectedHash) {
      this.logger.warn(
        `Reorg detected at ledger ${ledger}: expected ${expectedHash}, got ${stored.hash}`,
      );

      if (this.lastCheckpoint?.sequence === ledger) {
        const violation = validateLedgerHash(this.lastCheckpoint, expectedHash);
        if (violation) {
          this.transitionDegraded(violation);
        }
      }

      return ledger;
    }

    return null;
  }

  private toCheckpoint(row: IndexerCursorEntity): CursorCheckpoint {
    return {
      sequence: row.lastLedger,
      ledgerHash: row.ledgerHashes?.[row.ledgerHashes.length - 1]?.hash ?? "",
      processedEventCount: Number(row.processedEventCount),
      savedAt:
        row.savedAt instanceof Date
          ? row.savedAt.toISOString()
          : String(row.savedAt),
      version: row.checkpointVersion,
    };
  }

  private transitionDegraded(violation: IntegrityViolation): void {
    this.mode = "DEGRADED";
    this.lastViolation = violation;
    this.logger.error("cursor_integrity_violation", {
      violation: violation.code,
      detail: violation,
      action: "ingestion_paused_awaiting_operator",
    });
  }
}
