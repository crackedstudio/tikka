import {
  ARCHIVE_CHECKPOINT_INTEGRITY_VERSION,
  ArchiveCheckpointIntegrityError,
  computeIntegrityHash,
  integrityMismatchError,
  verifyCheckpointIntegrity,
} from "./integrity";
import { ArchiveJobStatus } from "../../database/entities/archive-checkpoint.entity";
import { buildCheckpoint, DAY_MS } from "./testing/archive-fixtures";

/**
 * `integrity.ts` is pure, so these specs need no repository, data source, or
 * archive run — only a checkpoint object.
 */
describe("archive integrity", () => {
  // Frozen so two separately-built fixtures share the same configSnapshot
  // cutoffDate and can be compared hash-for-hash.
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("computeIntegrityHash", () => {
    it("returns a 64-char hex digest", () => {
      expect(computeIntegrityHash(buildCheckpoint())).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns the same value across calls (deterministic)", () => {
      const checkpoint = buildCheckpoint({
        batchNumber: 3,
        totalArchived: 200,
        lastProcessedTimestamp: new Date(Date.now() - 40 * DAY_MS),
        lastProcessedId: "det-1",
      });

      expect(computeIntegrityHash(checkpoint)).toBe(
        computeIntegrityHash(checkpoint),
      );
    });

    it("changes when checkpoint state changes", () => {
      const checkpoint = buildCheckpoint({
        batchNumber: 3,
        totalArchived: 200,
      });
      const before = computeIntegrityHash(checkpoint);

      checkpoint.totalArchived = 201;

      expect(computeIntegrityHash(checkpoint)).not.toBe(before);
    });

    it.each([
      ["batchNumber", { batchNumber: 9 }],
      ["totalArchived", { totalArchived: 999 }],
      ["status", { status: ArchiveJobStatus.COMPLETED }],
      ["lastProcessedId", { lastProcessedId: "other" }],
      [
        "lastProcessedTimestamp",
        { lastProcessedTimestamp: new Date("2026-01-01T00:00:00.000Z") },
      ],
      [
        "configSnapshot",
        {
          configSnapshot: {
            retentionDays: 90,
            batchSize: 10,
            cutoffDate: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    ])("covers %s in the hashed state", (_field, override) => {
      expect(computeIntegrityHash(buildCheckpoint(override))).not.toBe(
        computeIntegrityHash(buildCheckpoint()),
      );
    });

    it("ignores row metadata that is not state-bearing", () => {
      const baseline = computeIntegrityHash(buildCheckpoint());

      const withOtherMetadata = buildCheckpoint({
        id: "a-completely-different-id",
        startedAt: new Date("2020-01-01T00:00:00.000Z"),
        updatedAt: new Date("2020-01-02T00:00:00.000Z"),
        completedAt: new Date("2020-01-03T00:00:00.000Z"),
        lastVerifiedAt: new Date("2020-01-04T00:00:00.000Z"),
        verificationFailureReason: "irrelevant",
      });

      expect(computeIntegrityHash(withOtherMetadata)).toBe(baseline);
    });

    it("is stable when configSnapshot keys are written in a different order", () => {
      const cutoffDate = new Date(Date.now() - 30 * DAY_MS).toISOString();

      const ordered = buildCheckpoint({
        configSnapshot: { retentionDays: 30, batchSize: 10, cutoffDate },
      });
      const shuffled = buildCheckpoint({
        configSnapshot: { cutoffDate, batchSize: 10, retentionDays: 30 },
      });

      expect(computeIntegrityHash(shuffled)).toBe(
        computeIntegrityHash(ordered),
      );
    });

    it("accepts a serialized timestamp string as well as a Date", () => {
      const timestamp = new Date(Date.now() - 40 * DAY_MS);
      const asDate = buildCheckpoint({ lastProcessedTimestamp: timestamp });
      const asString = buildCheckpoint({
        lastProcessedTimestamp: timestamp.toISOString() as unknown as Date,
      });

      expect(computeIntegrityHash(asString)).toBe(computeIntegrityHash(asDate));
    });

    it("pins the integrity format version", () => {
      // Bumping this constant must invalidate existing hashes on purpose.
      expect(ARCHIVE_CHECKPOINT_INTEGRITY_VERSION).toBe(1);
    });
  });

  describe("verifyCheckpointIntegrity", () => {
    it("returns 'ok' when hashes match", () => {
      const checkpoint = buildCheckpoint({ totalArchived: 10 });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);

      const result = verifyCheckpointIntegrity(checkpoint);

      expect(result.status).toBe("ok");
      expect(result.checkpointId).toBe(checkpoint.id);
      expect(result.storedHash).toBe(checkpoint.integrityHash);
      expect(result.computedHash).toBe(checkpoint.integrityHash);
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.reason).toBeUndefined();
    });

    it("returns 'failed' for a corrupted hash and keeps both hashes", () => {
      const checkpoint = buildCheckpoint({ totalArchived: 10 });
      const genuine = computeIntegrityHash(checkpoint);
      checkpoint.integrityHash = "0".repeat(64);

      const result = verifyCheckpointIntegrity(checkpoint);

      expect(result.status).toBe("failed");
      expect(result.storedHash).toBe("0".repeat(64));
      expect(result.computedHash).toBe(genuine);
      expect(result.reason).toMatch(/match/i);
    });

    it("returns 'missing' for a null hash (legacy checkpoint)", () => {
      const checkpoint = buildCheckpoint({ integrityHash: null });

      const result = verifyCheckpointIntegrity(checkpoint);

      expect(result.status).toBe("missing");
      expect(result.storedHash).toBeNull();
      expect(result.reason).toMatch(/legacy/i);
    });

    it("returns 'missing' for an undefined hash (pre-migration row)", () => {
      const checkpoint = buildCheckpoint();
      // @ts-expect-error: intentionally bypass type for legacy emulation
      checkpoint.integrityHash = undefined;

      const result = verifyCheckpointIntegrity(checkpoint);

      expect(result.status).toBe("missing");
      expect(result.storedHash).toBeNull();
    });
  });

  describe("ArchiveCheckpointIntegrityError", () => {
    it("exposes the checkpoint id, both hashes, and the reason", () => {
      const error = new ArchiveCheckpointIntegrityError(
        "boom",
        "cp-1",
        "a".repeat(64),
        "b".repeat(64),
        "mismatch",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ArchiveCheckpointIntegrityError");
      expect(error.checkpointId).toBe("cp-1");
      expect(error.expectedHash).toBe("a".repeat(64));
      expect(error.actualHash).toBe("b".repeat(64));
      expect(error.reason).toBe("mismatch");
    });
  });

  describe("integrityMismatchError", () => {
    it("puts both hashes and the checkpoint id in the operator-facing message", () => {
      const checkpoint = buildCheckpoint({
        id: "cp-msg",
        integrityHash: "0".repeat(64),
      });
      const result = verifyCheckpointIntegrity(checkpoint);

      const error = integrityMismatchError(checkpoint, result);

      expect(error).toBeInstanceOf(ArchiveCheckpointIntegrityError);
      expect(error.message).toContain("cp-msg");
      expect(error.message).toContain(result.computedHash);
      expect(error.message).toContain("0".repeat(64));
      expect(error.message).toMatch(/marked FAILED/);
      expect(error.expectedHash).toBe("0".repeat(64));
      expect(error.actualHash).toBe(result.computedHash);
    });

    it("falls back to a generic reason when the result has none", () => {
      const checkpoint = buildCheckpoint({ id: "cp-msg-2" });

      const error = integrityMismatchError(checkpoint, {
        status: "failed",
        checkpointId: checkpoint.id,
        storedHash: null,
        computedHash: "b".repeat(64),
        checkedAt: new Date(),
      });

      expect(error.reason).toBe("Integrity hash mismatch");
    });
  });
});
