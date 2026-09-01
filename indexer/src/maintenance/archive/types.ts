/**
 * Shared types and defaults for the raffle-events archiver.
 *
 * Kept dependency-free (no fs, no typeorm) so any archive module can import it
 * without pulling in infrastructure.
 */

/** Job type key stored on `archive_checkpoints.job_type` for this archiver. */
export const ARCHIVE_JOB_TYPE = "raffle_events";

/**
 * Defaults shared by the programmatic API (`archiveOldRaffleEvents`) and the
 * CLI entry point so the two can never drift apart.
 */
export const ARCHIVE_DEFAULTS = {
  retentionDays: 30,
  batchSize: 500,
  /** Archival is non-destructive unless the caller explicitly opts out. */
  dryRun: true,
  resumeFromCheckpoint: true,
} as const;

export interface ArchiveOptions {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  outDir?: string;
  maxBatch?: number;
  resumeFromCheckpoint?: boolean;
}

export interface ArchiveResult {
  totalArchived: number;
  batchesProcessed: number;
  filesCreated: string[];
  checkpointId?: string;
  resumed: boolean;
  reachedMaxBatch: boolean;
}

export interface ArchiveProgress {
  batchNumber: number;
  totalArchived: number;
  currentBatchSize: number;
  timestamp: Date;
}

export type ArchiveIntegrityVerificationStatus = "ok" | "failed" | "missing"; // legacy checkpoint, allowed for graceful migration

export interface ArchiveIntegrityVerificationResult {
  status: ArchiveIntegrityVerificationStatus;
  checkpointId: string;
  storedHash: string | null;
  computedHash: string;
  checkedAt: Date;
  reason?: string;
}

/** Run configuration captured on the checkpoint's `configSnapshot`. */
export interface ArchiveCheckpointConfig {
  jobType: string;
  cutoff: Date;
  retentionDays: number;
  batchSize: number;
  maxBatch?: number;
}

/** Cursor + counters persisted after each successfully archived batch. */
export interface ArchiveBatchProgress {
  batchNumber: number;
  totalArchived: number;
  lastProcessedTimestamp: Date;
  lastProcessedId: string;
}
