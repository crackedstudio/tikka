import { EntityManager, Repository } from "typeorm";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../database/entities/archive-checkpoint.entity";
import {
  computeIntegrityHash,
  integrityMismatchError,
  verifyCheckpointIntegrity,
} from "./integrity";
import {
  logIntegrityVerification,
  logProgress,
  raiseIntegrityAlert,
} from "./logging";
import {
  ArchiveBatchProgress,
  ArchiveCheckpointConfig,
  ArchiveIntegrityVerificationResult,
} from "./types";

/**
 * Persist a verification failure on the checkpoint row and emit a structured
 * alert. The stored integrity hash is intentionally NOT overwritten so
 * operators retain the evidence of the mismatch.
 */
export async function recordIntegrityFailure(
  checkpointRepo: Repository<ArchiveCheckpointEntity>,
  checkpoint: ArchiveCheckpointEntity,
  result: ArchiveIntegrityVerificationResult,
): Promise<void> {
  checkpoint.status = ArchiveJobStatus.FAILED;
  checkpoint.lastVerifiedAt = result.checkedAt;
  checkpoint.verificationFailureReason =
    result.reason ?? "Integrity hash mismatch";
  await checkpointRepo.save(checkpoint);
  raiseIntegrityAlert(checkpoint, result);
}

/**
 * Owns the lifecycle of an `archive_checkpoints` row: creation, resume-time
 * integrity verification, per-batch progress, and completion.
 *
 * Wraps a single repository so checkpoint behaviour can be exercised with a
 * mock repo, without standing up an archive run.
 */
export class ArchiveCheckpointService {
  constructor(
    private readonly checkpointRepo: Repository<ArchiveCheckpointEntity>,
  ) {}

  /**
   * Resolve the checkpoint this run should use: reuse the verified in-progress
   * row or create a fresh one.
   *
   * `resumed` is true when the checkpoint already carries completed batches, in
   * which case its integrity hash has been verified.
   *
   * @throws ArchiveCheckpointIntegrityError when a resumed hash mismatches.
   */
  async begin(config: ArchiveCheckpointConfig): Promise<{
    checkpoint: ArchiveCheckpointEntity;
    resumed: boolean;
  }> {
    const checkpoint = await this.findOrCreate(config);

    if (checkpoint.batchNumber === 0) {
      return { checkpoint, resumed: false };
    }

    await this.verifyForResume(checkpoint);

    logProgress({
      message: `Resuming from checkpoint: batch ${checkpoint.batchNumber}, archived ${checkpoint.totalArchived} records`,
      batchNumber: checkpoint.batchNumber,
      totalArchived: checkpoint.totalArchived,
      checkpointId: checkpoint.id,
    });

    return { checkpoint, resumed: true };
  }

  /**
   * Find the existing in-progress checkpoint or create a new one for the job.
   * Ensures only one active checkpoint exists per job type and cutoff.
   */
  async findOrCreate(
    config: ArchiveCheckpointConfig,
  ): Promise<ArchiveCheckpointEntity> {
    // Look for existing in-progress checkpoint
    let checkpoint = await this.checkpointRepo.findOne({
      where: {
        jobType: config.jobType,
        status: ArchiveJobStatus.IN_PROGRESS,
      },
      order: { startedAt: "DESC" },
    });

    if (checkpoint) {
      // Validate checkpoint is for the same cutoff date
      const checkpointCutoff = new Date(checkpoint.configSnapshot.cutoffDate);
      if (checkpointCutoff.getTime() === config.cutoff.getTime()) {
        return checkpoint;
      }

      // Different cutoff, mark old checkpoint as completed and create new one
      checkpoint.status = ArchiveJobStatus.COMPLETED;
      checkpoint.completedAt = new Date();
      await this.checkpointRepo.save(checkpoint);
    }

    // Create new checkpoint
    checkpoint = this.checkpointRepo.create({
      jobType: config.jobType,
      status: ArchiveJobStatus.IN_PROGRESS,
      totalArchived: 0,
      batchNumber: 0,
      lastProcessedTimestamp: null,
      lastProcessedId: null,
      configSnapshot: {
        retentionDays: config.retentionDays,
        batchSize: config.batchSize,
        maxBatch: config.maxBatch,
        cutoffDate: config.cutoff.toISOString(),
      },
    });

    // Compute and store the integrity hash on creation so resume-time
    // verification has a value to compare against from the very first save.
    checkpoint.integrityHash = computeIntegrityHash(checkpoint);
    checkpoint.lastVerifiedAt = new Date();

    return await this.checkpointRepo.save(checkpoint);
  }

  /**
   * Verify a resumed checkpoint's integrity hash before any archival work
   * begins. On mismatch the checkpoint is marked FAILED (preserving the corrupt
   * hash for operator review) and an error is thrown so the caller halts.
   *
   * @throws ArchiveCheckpointIntegrityError when the stored hash mismatches.
   */
  async verifyForResume(
    checkpoint: ArchiveCheckpointEntity,
  ): Promise<ArchiveIntegrityVerificationResult> {
    const verification = verifyCheckpointIntegrity(checkpoint);
    logIntegrityVerification(verification);

    if (verification.status === "failed") {
      await recordIntegrityFailure(
        this.checkpointRepo,
        checkpoint,
        verification,
      );
      throw integrityMismatchError(checkpoint, verification);
    }

    // Verification passed (ok or missing-for-legacy). Persist lastVerifiedAt.
    checkpoint.lastVerifiedAt = verification.checkedAt;
    await this.checkpointRepo.save(checkpoint);

    return verification;
  }

  /**
   * Advance the checkpoint cursor after a batch was archived and deleted.
   *
   * Saved through the caller's `EntityManager` so the cursor update commits in
   * the same transaction as the row deletions. The integrity hash is recomputed
   * here so the hash and the row state can never drift apart.
   */
  async saveBatchProgress(
    manager: EntityManager,
    checkpoint: ArchiveCheckpointEntity,
    progress: ArchiveBatchProgress,
  ): Promise<void> {
    checkpoint.batchNumber = progress.batchNumber;
    checkpoint.totalArchived = progress.totalArchived;
    checkpoint.lastProcessedTimestamp = progress.lastProcessedTimestamp;
    checkpoint.lastProcessedId = progress.lastProcessedId;
    checkpoint.updatedAt = new Date();
    checkpoint.integrityHash = computeIntegrityHash(checkpoint);
    checkpoint.lastVerifiedAt = new Date();
    await manager.save(checkpoint);
  }

  /**
   * Mark the checkpoint COMPLETED. The integrity hash is kept in sync with the
   * final status change so a resume after completion verifies cleanly.
   */
  async markCompleted(checkpoint: ArchiveCheckpointEntity): Promise<void> {
    checkpoint.status = ArchiveJobStatus.COMPLETED;
    checkpoint.completedAt = new Date();
    checkpoint.integrityHash = computeIntegrityHash(checkpoint);
    checkpoint.lastVerifiedAt = new Date();
    await this.checkpointRepo.save(checkpoint);
  }
}
