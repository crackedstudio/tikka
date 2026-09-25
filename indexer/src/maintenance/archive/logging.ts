import { ArchiveCheckpointEntity } from "../../database/entities/archive-checkpoint.entity";
import { ArchiveIntegrityVerificationResult } from "./types";

/**
 * Structured, single-line JSON logging for the archiver.
 *
 * Log shapes are part of the operator contract (`docs/runbooks/archive-raffle-events.md`
 * pipes output through `jq`), so field names must not change without updating
 * the runbook.
 */

export interface ArchiveProgressLog {
  message: string;
  batchNumber: number;
  totalArchived: number;
  currentBatchSize?: number;
  checkpointId?: string;
  timestamp?: Date;
}

/**
 * Log progress with structured information for monitoring and debugging.
 */
export function logProgress(progress: ArchiveProgressLog): void {
  const timestamp = progress.timestamp ?? new Date();
  const logEntry = {
    timestamp: timestamp.toISOString(),
    message: progress.message,
    batchNumber: progress.batchNumber,
    totalArchived: progress.totalArchived,
    currentBatchSize: progress.currentBatchSize,
    checkpointId: progress.checkpointId,
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Emit a single JSON line describing the resume-time integrity verification
 * result. Distinct from logProgress so observability pipelines can filter on
 * `event: "archive_integrity_verification"`.
 */
export function logIntegrityVerification(
  result: ArchiveIntegrityVerificationResult,
): void {
  const entry = {
    event: "archive_integrity_verification",
    status: result.status,
    checkpointId: result.checkpointId,
    storedHash: result.storedHash,
    computedHash: result.computedHash,
    reason: result.reason,
    checkedAt: result.checkedAt.toISOString(),
  };
  if (result.status === "failed") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Emit a structured JSON alert to stderr. Severity is "critical" because a
 * corrupted archival state could lead to data loss if silently overwritten.
 */
export function raiseIntegrityAlert(
  checkpoint: ArchiveCheckpointEntity,
  result: ArchiveIntegrityVerificationResult,
): void {
  const alert = {
    severity: "critical",
    alert: "archive_checkpoint_integrity_mismatch",
    checkpointId: checkpoint.id,
    jobType: checkpoint.jobType,
    batchNumber: checkpoint.batchNumber,
    storedHash: result.storedHash,
    computedHash: result.computedHash,
    reason: result.reason,
    checkedAt: result.checkedAt.toISOString(),
  };
  console.error(JSON.stringify(alert));
}
