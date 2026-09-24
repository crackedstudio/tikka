import * as crypto from "crypto";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../database/entities/archive-checkpoint.entity";
import { ArchiveIntegrityVerificationResult } from "./types";

/**
 * Pure checkpoint integrity hashing and verification.
 *
 * Deliberately free of I/O so integrity behaviour can be unit-tested without a
 * repository, a data source, or an archive run. See `integrity.spec.ts`.
 */

/**
 * Format version used as part of the integrity hash. Bump this whenever the
 * set of hashed fields or the canonicalization algorithm changes so existing
 * checkpoints are rejected (rather than silently passing) verification.
 */
export const ARCHIVE_CHECKPOINT_INTEGRITY_VERSION = 1;

/**
 * Fields fed into the integrity hash. Row-level metadata (id, startedAt,
 * updatedAt, completedAt) is intentionally excluded so the hash compactly
 * captures the state worth verifying and remains stable across saves.
 */
interface ArchivalCheckpointHashedState {
  jobType: string;
  lastProcessedTimestamp: string | null;
  lastProcessedId: string | null;
  totalArchived: number;
  batchNumber: number;
  status: ArchiveJobStatus;
  configSnapshot: Record<string, unknown>;
  integrityVersion: number;
}

/**
 * Thrown when an in-progress checkpoint's stored integrity hash does not match
 * the recomputed value on resume. The archive loop refuses to start in this
 * case to prevent silently overwriting corrupted state.
 */
export class ArchiveCheckpointIntegrityError extends Error {
  constructor(
    message: string,
    public readonly checkpointId: string,
    public readonly expectedHash: string | null,
    public readonly actualHash: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "ArchiveCheckpointIntegrityError";
  }
}

/**
 * Build the halt-the-run error for a failed verification. Both hashes are in the
 * message so an operator can triage straight from the logs.
 */
export function integrityMismatchError(
  checkpoint: ArchiveCheckpointEntity,
  result: ArchiveIntegrityVerificationResult,
): ArchiveCheckpointIntegrityError {
  return new ArchiveCheckpointIntegrityError(
    `Refusing to start archival: integrity verification failed for checkpoint ${checkpoint.id}. ` +
      `Stored hash ${result.storedHash} does not match computed hash ${result.computedHash}. ` +
      `Checkpoint marked FAILED -- manual intervention required.`,
    checkpoint.id,
    result.storedHash,
    result.computedHash,
    result.reason ?? "Integrity hash mismatch",
  );
}

/** Recursively walk a value and sort object keys for stable canonicalization. */
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortKeys(entry));
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const ordered: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      ordered[key] = deepSortKeys(obj[key]);
    }
    return ordered;
  }
  return value;
}

/** Canonical JSON serialization with recursively-sorted object keys. */
function canonicalizeCheckpointState(
  state: ArchivalCheckpointHashedState,
): string {
  return JSON.stringify(deepSortKeys(state));
}

/**
 * SHA-256 (hex) over a canonicalized representation of the checkpoint's
 * state-bearing fields. Pure, deterministic, side-effect-free.
 */
export function computeIntegrityHash(
  checkpoint: ArchiveCheckpointEntity,
): string {
  const timestamp: Date | null =
    checkpoint.lastProcessedTimestamp instanceof Date
      ? checkpoint.lastProcessedTimestamp
      : checkpoint.lastProcessedTimestamp
        ? new Date(checkpoint.lastProcessedTimestamp)
        : null;

  const state: ArchivalCheckpointHashedState = {
    jobType: checkpoint.jobType,
    lastProcessedTimestamp: timestamp ? timestamp.toISOString() : null,
    lastProcessedId: checkpoint.lastProcessedId,
    totalArchived: checkpoint.totalArchived,
    batchNumber: checkpoint.batchNumber,
    status: checkpoint.status,
    configSnapshot: checkpoint.configSnapshot as unknown as Record<
      string,
      unknown
    >,
    integrityVersion: ARCHIVE_CHECKPOINT_INTEGRITY_VERSION,
  };
  return crypto
    .createHash("sha256")
    .update(canonicalizeCheckpointState(state))
    .digest("hex");
}

/**
 * Verify an in-progress checkpoint's integrity hash on resume.
 *
 *  - storedHash null/undefined : 'missing' (legacy); allowed; hash backfilled on next save.
 *  - storedHash == computed    : 'ok'.
 *  - storedHash != computed    : 'failed'; caller MUST halt archival.
 */
export function verifyCheckpointIntegrity(
  checkpoint: ArchiveCheckpointEntity,
): ArchiveIntegrityVerificationResult {
  const computedHash = computeIntegrityHash(checkpoint);
  // Coerce undefined (test mocks and any pre-migration row that never had the
  // column) to null so legacy checkpoints are treated as 'missing' rather than
  // as a hash mismatch.
  const storedHash = checkpoint.integrityHash ?? null;
  const checkedAt = new Date();

  if (storedHash == null) {
    return {
      status: "missing",
      checkpointId: checkpoint.id,
      storedHash,
      computedHash,
      checkedAt,
      reason:
        "Checkpoint has no integrity hash (legacy state). Hash will be computed on next save.",
    };
  }

  if (storedHash !== computedHash) {
    return {
      status: "failed",
      checkpointId: checkpoint.id,
      storedHash,
      computedHash,
      checkedAt,
      reason: "Computed integrity hash does not match stored hash.",
    };
  }

  return {
    status: "ok",
    checkpointId: checkpoint.id,
    storedHash,
    computedHash,
    checkedAt,
  };
}
