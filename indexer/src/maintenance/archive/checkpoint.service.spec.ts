import { EntityManager } from "typeorm";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../database/entities/archive-checkpoint.entity";
import {
  ArchiveCheckpointService,
  recordIntegrityFailure,
} from "./checkpoint.service";
import {
  ArchiveCheckpointIntegrityError,
  computeIntegrityHash,
  verifyCheckpointIntegrity,
} from "./integrity";
import { ARCHIVE_JOB_TYPE } from "./types";
import {
  buildCheckpoint,
  createMockCheckpointRepo,
  createMockEntityManager,
  cutoffFor,
  DAY_MS,
  MockCheckpointRepo,
} from "./testing/archive-fixtures";

/**
 * Checkpoint lifecycle specs. The service only needs a repository double, so
 * none of these tests stand up an archive run.
 */
describe("ArchiveCheckpointService", () => {
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  function serviceWith(repo: MockCheckpointRepo): ArchiveCheckpointService {
    return new ArchiveCheckpointService(repo);
  }

  const config = () => ({
    jobType: ARCHIVE_JOB_TYPE,
    cutoff: cutoffFor(30),
    retentionDays: 30,
    batchSize: 10,
    maxBatch: 5,
  });

  describe("findOrCreate", () => {
    it("creates a fresh checkpoint with a verifiable integrity hash", async () => {
      const repo = createMockCheckpointRepo({ createdId: "cp-created" });

      const checkpoint = await serviceWith(repo).findOrCreate(config());

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(checkpoint.status).toBe(ArchiveJobStatus.IN_PROGRESS);
      expect(checkpoint.batchNumber).toBe(0);
      expect(checkpoint.totalArchived).toBe(0);
      expect(checkpoint.lastProcessedTimestamp).toBeNull();
      expect(checkpoint.lastProcessedId).toBeNull();
      expect(checkpoint.configSnapshot).toEqual({
        retentionDays: 30,
        batchSize: 10,
        maxBatch: 5,
        cutoffDate: cutoffFor(30).toISOString(),
      });
      expect(checkpoint.integrityHash).toMatch(/^[0-9a-f]{64}$/);
      expect(checkpoint.lastVerifiedAt).toBeInstanceOf(Date);
      expect(verifyCheckpointIntegrity(checkpoint).status).toBe("ok");
    });

    it("queries only in-progress checkpoints for the job type", async () => {
      const repo = createMockCheckpointRepo();

      await serviceWith(repo).findOrCreate(config());

      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          jobType: ARCHIVE_JOB_TYPE,
          status: ArchiveJobStatus.IN_PROGRESS,
        },
        order: { startedAt: "DESC" },
      });
    });

    it("reuses an in-progress checkpoint for the same cutoff", async () => {
      const existing = buildCheckpoint({ id: "cp-existing", batchNumber: 4 });
      const repo = createMockCheckpointRepo({ existing });

      const checkpoint = await serviceWith(repo).findOrCreate(config());

      expect(checkpoint).toBe(existing);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("completes a stale checkpoint from a different cutoff and starts a new one", async () => {
      const stale = buildCheckpoint({
        id: "cp-stale",
        batchNumber: 4,
        configSnapshot: {
          retentionDays: 90,
          batchSize: 10,
          cutoffDate: cutoffFor(90).toISOString(),
        },
      });
      const repo = createMockCheckpointRepo({
        existing: stale,
        createdId: "cp-fresh",
      });

      const checkpoint = await serviceWith(repo).findOrCreate(config());

      expect(stale.status).toBe(ArchiveJobStatus.COMPLETED);
      expect(stale.completedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(stale);
      expect(checkpoint.id).toBe("cp-fresh");
      expect(checkpoint.batchNumber).toBe(0);
    });
  });

  describe("begin", () => {
    it("reports a fresh checkpoint as not resumed", async () => {
      const repo = createMockCheckpointRepo({ createdId: "cp-fresh" });

      const { checkpoint, resumed } = await serviceWith(repo).begin(config());

      expect(resumed).toBe(false);
      expect(checkpoint.id).toBe("cp-fresh");
      expect(checkpoint.batchNumber).toBe(0);
    });

    it("verifies and resumes a checkpoint that already has batches", async () => {
      const existing = buildCheckpoint({
        id: "cp-resume",
        batchNumber: 2,
        totalArchived: 20,
      });
      existing.integrityHash = computeIntegrityHash(existing);
      const repo = createMockCheckpointRepo({ existing });

      const { checkpoint, resumed } = await serviceWith(repo).begin(config());

      expect(resumed).toBe(true);
      expect(checkpoint).toBe(existing);
      expect(existing.lastVerifiedAt).toBeInstanceOf(Date);
    });

    it("refuses to begin when a resumed checkpoint fails verification", async () => {
      const existing = buildCheckpoint({
        id: "cp-bad",
        batchNumber: 2,
        integrityHash: "0".repeat(64),
      });
      const repo = createMockCheckpointRepo({ existing });

      await expect(serviceWith(repo).begin(config())).rejects.toBeInstanceOf(
        ArchiveCheckpointIntegrityError,
      );
      expect(existing.status).toBe(ArchiveJobStatus.FAILED);
    });
  });

  describe("verifyForResume", () => {
    it("returns 'ok' and stamps lastVerifiedAt when the hash matches", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-happy",
        totalArchived: 5,
        lastProcessedTimestamp: new Date(Date.now() - 50 * DAY_MS),
        lastProcessedId: "e1",
      });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      const result = await serviceWith(repo).verifyForResume(checkpoint);

      expect(result.status).toBe("ok");
      expect(checkpoint.lastVerifiedAt).toEqual(result.checkedAt);
      expect(repo.save).toHaveBeenCalledWith(checkpoint);
      expect(checkpoint.status).toBe(ArchiveJobStatus.IN_PROGRESS);
    });

    it("returns 'missing' for a legacy checkpoint without halting", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-legacy",
        integrityHash: null,
      });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      const result = await serviceWith(repo).verifyForResume(checkpoint);

      expect(result.status).toBe("missing");
      expect(checkpoint.status).toBe(ArchiveJobStatus.IN_PROGRESS);
      expect(repo.save).toHaveBeenCalledWith(checkpoint);
    });

    it("throws, marks the checkpoint FAILED, and preserves the corrupt hash", async () => {
      const corrupt = "0".repeat(64);
      const checkpoint = buildCheckpoint({
        id: "cp-corrupt",
        batchNumber: 2,
        totalArchived: 100,
        integrityHash: corrupt,
      });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      await expect(
        serviceWith(repo).verifyForResume(checkpoint),
      ).rejects.toBeInstanceOf(ArchiveCheckpointIntegrityError);

      expect(checkpoint.status).toBe(ArchiveJobStatus.FAILED);
      // Evidence of the mismatch must survive for operator review.
      expect(checkpoint.integrityHash).toBe(corrupt);
      expect(checkpoint.verificationFailureReason).toMatch(/match/i);
      expect(checkpoint.lastVerifiedAt).toBeInstanceOf(Date);
    });

    it("exposes both hashes on the thrown error", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-fields",
        totalArchived: 50,
        integrityHash: "deadbeef".repeat(8),
      });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      let caught: unknown;
      try {
        await serviceWith(repo).verifyForResume(checkpoint);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ArchiveCheckpointIntegrityError);
      const error = caught as ArchiveCheckpointIntegrityError;
      expect(error.checkpointId).toBe("cp-fields");
      expect(error.expectedHash).toBe("deadbeef".repeat(8));
      expect(error.actualHash).toMatch(/^[0-9a-f]{64}$/);
      expect(error.reason).toMatch(/match/i);
    });

    it("emits a critical, parseable alert on mismatch", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-alert",
        batchNumber: 7,
        integrityHash: "f".repeat(64),
      });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      await expect(
        serviceWith(repo).verifyForResume(checkpoint),
      ).rejects.toBeInstanceOf(ArchiveCheckpointIntegrityError);

      const alert = errorSpy.mock.calls
        .map((call) => {
          try {
            return JSON.parse(call[0] as string);
          } catch {
            return null;
          }
        })
        .find(
          (entry) => entry?.alert === "archive_checkpoint_integrity_mismatch",
        );

      expect(alert).toMatchObject({
        severity: "critical",
        checkpointId: "cp-alert",
        jobType: ARCHIVE_JOB_TYPE,
        batchNumber: 7,
        storedHash: "f".repeat(64),
      });
      expect(alert.checkedAt).toBe(fixedNow.toISOString());
    });
  });

  describe("saveBatchProgress", () => {
    it("advances the cursor and rehashes through the transaction manager", async () => {
      const checkpoint = buildCheckpoint({ id: "cp-progress" });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);
      const staleHash = checkpoint.integrityHash;
      const repo = createMockCheckpointRepo({ existing: checkpoint });
      const manager = createMockEntityManager();
      const lastProcessedTimestamp = new Date(Date.now() - 31 * DAY_MS);

      await serviceWith(repo).saveBatchProgress(
        manager as unknown as EntityManager,
        checkpoint,
        {
          batchNumber: 3,
          totalArchived: 30,
          lastProcessedTimestamp,
          lastProcessedId: "row-30",
        },
      );

      expect(checkpoint.batchNumber).toBe(3);
      expect(checkpoint.totalArchived).toBe(30);
      expect(checkpoint.lastProcessedTimestamp).toBe(lastProcessedTimestamp);
      expect(checkpoint.lastProcessedId).toBe("row-30");
      expect(checkpoint.integrityHash).not.toBe(staleHash);
      // Hash and row state must commit together, never drift.
      expect(verifyCheckpointIntegrity(checkpoint).status).toBe("ok");
      expect(manager.save).toHaveBeenCalledWith(checkpoint);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("markCompleted", () => {
    it("closes the checkpoint with a hash that still verifies", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-done",
        batchNumber: 2,
        totalArchived: 20,
      });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      await serviceWith(repo).markCompleted(checkpoint);

      expect(checkpoint.status).toBe(ArchiveJobStatus.COMPLETED);
      expect(checkpoint.completedAt).toBeInstanceOf(Date);
      expect(verifyCheckpointIntegrity(checkpoint).status).toBe("ok");
      expect(repo.save).toHaveBeenCalledWith(checkpoint);
    });
  });

  describe("recordIntegrityFailure", () => {
    it("persists the failure without touching the stored hash", async () => {
      const checkpoint: ArchiveCheckpointEntity = buildCheckpoint({
        id: "cp-record",
        integrityHash: "a".repeat(64),
      });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      await recordIntegrityFailure(repo, checkpoint, {
        status: "failed",
        checkpointId: checkpoint.id,
        storedHash: "a".repeat(64),
        computedHash: "b".repeat(64),
        checkedAt: fixedNow,
        reason: "Computed integrity hash does not match stored hash.",
      });

      expect(checkpoint.status).toBe(ArchiveJobStatus.FAILED);
      expect(checkpoint.integrityHash).toBe("a".repeat(64));
      expect(checkpoint.verificationFailureReason).toBe(
        "Computed integrity hash does not match stored hash.",
      );
      expect(checkpoint.lastVerifiedAt).toBe(fixedNow);
      expect(repo.save).toHaveBeenCalledWith(checkpoint);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("falls back to a generic reason when none is supplied", async () => {
      const checkpoint = buildCheckpoint({ id: "cp-no-reason" });
      const repo = createMockCheckpointRepo({ existing: checkpoint });

      await recordIntegrityFailure(repo, checkpoint, {
        status: "failed",
        checkpointId: checkpoint.id,
        storedHash: null,
        computedHash: "b".repeat(64),
        checkedAt: fixedNow,
      });

      expect(checkpoint.verificationFailureReason).toBe(
        "Integrity hash mismatch",
      );
    });
  });
});
