import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { ArchiveCheckpointEntity } from "../database/entities/archive-checkpoint.entity";
import { ArchiveJobStatus } from "../database/entities/archive-checkpoint.entity";
import { computeIntegrityHash } from "../maintenance/archive-raffle-events";

export type ArchiveIntegrityIndicator =
  | "ok"
  | "failed"
  | "no_checkpoint"; // never run yet: nothing to verify against, treat as ok

export interface ArchiveIntegrityStatusSnapshot {
  /** Indicator surfaced on the /health endpoint. */
  archive_integrity: ArchiveIntegrityIndicator;
  /** When the most recent verification ran (ISO-8601) or null. */
  last_verified_at: string | null;
  /** ID of the most recent archive checkpoint, or null. */
  checkpoint_id: string | null;
  /** Reason string when archive_integrity === 'failed', otherwise null. */
  failure_reason: string | null;
  /**
   * Job type for the most recent checkpoint (currently only "raffle_events"
   * is implemented; future archival jobs will be enumerated here).
   */
  job_type: string | null;
}

/**
 * Surfaces the most recent archive checkpoint's integrity state on the
 * /health endpoint.
 *
 * The query path intentionally avoids recomputing hashes for healthy rows on
 * every health check (which would be expensive), and instead trusts the
 * `status` field set by the verifier. Where the row exists but a hash is
 * present, we do a cheap recomputation to catch hashes that drift between
 * verification runs.
 *
 * Service-result mapping rules:
 *   - no checkpoint row             -> 'no_checkpoint'
 *   - status === FAILED             -> 'failed'
 *   - hash present and mismatches   -> 'failed'
 *   - hash present and matches      -> 'ok'
 *   - hash absent (legacy)          -> 'ok'
 *   - unable to read archive_checkpoints -> 'failed' (DB error)
 */
@Injectable()
export class ArchiveIntegrityStatusService {
  constructor(private readonly dataSource: DataSource) {}

  async getStatus(): Promise<ArchiveIntegrityStatusSnapshot> {
    if (!this.dataSource?.isInitialized) {
      return {
        archive_integrity: "failed",
        last_verified_at: null,
        checkpoint_id: null,
        failure_reason: "DataSource not initialized",
        job_type: null,
      };
    }

    let latest: ArchiveCheckpointEntity | null;
    try {
      const repo = this.dataSource.getRepository(ArchiveCheckpointEntity);
      latest = await repo.findOne({
        where: {},
        order: { updatedAt: "DESC" },
      });
    } catch (err) {
      return {
        archive_integrity: "failed",
        last_verified_at: null,
        checkpoint_id: null,
        failure_reason:
          err instanceof Error
            ? `Unable to query archive_checkpoints: ${err.message}`
            : "Unable to query archive_checkpoints: unknown error",
        job_type: null,
      };
    }

    if (!latest) {
      return {
        archive_integrity: "no_checkpoint",
        last_verified_at: null,
        checkpoint_id: null,
        failure_reason: null,
        job_type: null,
      };
    }

    if (latest.status === ArchiveJobStatus.FAILED) {
      return {
        archive_integrity: "failed",
        last_verified_at: latest.lastVerifiedAt
          ? latest.lastVerifiedAt.toISOString()
          : null,
        checkpoint_id: latest.id,
        failure_reason:
          latest.verificationFailureReason ??
          "Checkpoint previously marked FAILED by integrity verifier",
        job_type: latest.jobType,
      };
    }

    if (latest.integrityHash) {
      try {
        const recomputed = computeIntegrityHash(latest);
        if (recomputed !== latest.integrityHash) {
          return {
            archive_integrity: "failed",
            last_verified_at: latest.lastVerifiedAt
              ? latest.lastVerifiedAt.toISOString()
              : null,
            checkpoint_id: latest.id,
            failure_reason:
              "Stored integrity hash no longer matches current row state",
            job_type: latest.jobType,
          };
        }
      } catch (err) {
        return {
          archive_integrity: "failed",
          last_verified_at: latest.lastVerifiedAt
            ? latest.lastVerifiedAt.toISOString()
            : null,
          checkpoint_id: latest.id,
          failure_reason:
            err instanceof Error
              ? `Hash recomputation failed: ${err.message}`
              : "Hash recomputation failed",
          job_type: latest.jobType,
        };
      }
    }

    return {
      archive_integrity: "ok",
      last_verified_at: latest.lastVerifiedAt
        ? latest.lastVerifiedAt.toISOString()
        : null,
      checkpoint_id: latest.id,
      failure_reason: null,
      job_type: latest.jobType,
    };
  }
}
