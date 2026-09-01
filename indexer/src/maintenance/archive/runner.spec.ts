import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ArchiveJobStatus } from "../../database/entities/archive-checkpoint.entity";
import {
  ArchiveCheckpointIntegrityError,
  computeIntegrityHash,
} from "./integrity";
import { archiveOldRaffleEvents } from "./runner";
import {
  buildCheckpoint,
  createMockCheckpointRepo,
  createMockDataSource,
  createMockEventRepo,
  cutoffFor,
  DAY_MS,
  makeEvent,
} from "./testing/archive-fixtures";

/**
 * End-to-end orchestration specs for the archive loop. Unit-level behaviour of
 * the collaborators lives in `integrity.spec.ts`, `checkpoint.service.spec.ts`,
 * `batch-selector.spec.ts`, and `writer.spec.ts`.
 */
describe("archiveOldRaffleEvents", () => {
  let tmpDir: string;
  let logSpy: jest.SpyInstance;

  // Freeze Date.now() for the entire suite so any fixture that captures
  // `new Date(Date.now() - …)` matches exactly the cutoff that
  // archiveOldRaffleEvents computes from `retentionDays`. Under real time the
  // difference between fixture-time and call-time Date.now() can drift by
  // several ms, causing the resumption code path to mis-identify a same-cutoff
  // checkpoint as belonging to a previous run.
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    jest.useRealTimers();
  });

  function csvFiles(): string[] {
    return fs.readdirSync(tmpDir).filter((file) => file.endsWith(".csv"));
  }

  describe("Basic Archiving", () => {
    it("should write CSV and delete rows when not dryRun", async () => {
      const eventRepo = createMockEventRepo([
        makeEvent("a1", 40),
        makeEvent("a2", 31),
      ]);
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "checkpoint-1",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.totalArchived).toBe(2);
      expect(result.batchesProcessed).toBe(1);
      expect(result.filesCreated.length).toBe(1);
      expect(result.resumed).toBe(false);
      expect(result.checkpointId).toBe("checkpoint-1");

      const files = csvFiles();
      expect(files.length).toBe(1);

      const csvContent = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(csvContent).toContain("id,raffle_id,event_type");
      expect(csvContent).toContain("a1");
      expect(csvContent).toContain("a2");

      // Deletion and the checkpoint update share one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const [manager] = dataSource.transactionManagers;
      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it("creates the output directory when it does not exist", async () => {
      const outDir = path.join(tmpDir, "nested", "archives");
      const eventRepo = createMockEventRepo([makeEvent("a3", 40)]);
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir,
        resumeFromCheckpoint: false,
      });

      expect(
        fs.readdirSync(outDir).filter((f) => f.endsWith(".csv")),
      ).toHaveLength(1);
    });

    it("should not delete when dryRun is true", async () => {
      const eventRepo = createMockEventRepo([makeEvent("b1", 60)]);
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir: tmpDir,
        resumeFromCheckpoint: false,
      });

      expect(result.totalArchived).toBe(1);
      expect(result.batchesProcessed).toBe(1);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(checkpointRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("Checkpoint Resumption", () => {
    it("should resume from existing checkpoint after interruption", async () => {
      const batch1Event2 = makeEvent("c2", 49);
      const existingCheckpoint = buildCheckpoint({
        id: "checkpoint-existing",
        lastProcessedTimestamp: batch1Event2.indexedAt,
        lastProcessedId: batch1Event2.id,
        totalArchived: 2,
        batchNumber: 1,
      });

      const eventRepo = createMockEventRepo([
        makeEvent("c3", 48),
        makeEvent("c4", 47),
      ]);
      const checkpointRepo = createMockCheckpointRepo({
        existing: existingCheckpoint,
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.resumed).toBe(true);
      expect(result.totalArchived).toBe(4); // 2 from checkpoint + 2 new
      expect(result.batchesProcessed).toBe(2); // Started at batch 1, processed batch 2
      expect(result.checkpointId).toBe("checkpoint-existing");
      expect(checkpointRepo.save).toHaveBeenCalled();
    });

    it("should handle partial batch interruption correctly", async () => {
      const processedEvent = makeEvent("d1", 60);
      const existingCheckpoint = buildCheckpoint({
        id: "checkpoint-partial",
        lastProcessedTimestamp: processedEvent.indexedAt,
        lastProcessedId: processedEvent.id,
        totalArchived: 1,
        batchNumber: 1,
      });

      const eventRepo = createMockEventRepo([
        makeEvent("d2", 59),
        makeEvent("d3", 58),
      ]);
      const checkpointRepo = createMockCheckpointRepo({
        existing: existingCheckpoint,
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.resumed).toBe(true);
      expect(result.totalArchived).toBe(3); // 1 from checkpoint + 2 new
      expect(result.batchesProcessed).toBe(2);

      // The checkpoint cursor is handed to the selector.
      expect(eventRepo.queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("event.indexedAt > :lastTimestamp"),
        expect.objectContaining({
          lastTimestamp: processedEvent.indexedAt,
          lastId: processedEvent.id,
        }),
      );
    });

    it("should not duplicate processing when resuming", async () => {
      const event1 = makeEvent("e1", 50);
      const existingCheckpoint = buildCheckpoint({
        id: "checkpoint-no-dup",
        lastProcessedTimestamp: event1.indexedAt,
        lastProcessedId: event1.id,
        totalArchived: 1,
        batchNumber: 1,
      });

      // Only event2 is returned — event1 is already archived.
      const eventRepo = createMockEventRepo([makeEvent("e2", 49)]);
      const checkpointRepo = createMockCheckpointRepo({
        existing: existingCheckpoint,
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.totalArchived).toBe(2); // 1 from checkpoint + 1 new
      expect(result.batchesProcessed).toBe(2);

      const files = csvFiles();
      expect(files.length).toBe(1);

      const csvContent = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(csvContent).toContain("e2");
      expect(csvContent).not.toContain("e1"); // Should not re-process
    });

    it("skips checkpointing entirely when resumeFromCheckpoint is false", async () => {
      const eventRepo = createMockEventRepo([makeEvent("f0", 40)]);
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: false,
      });

      expect(result.checkpointId).toBeUndefined();
      expect(checkpointRepo.findOne).not.toHaveBeenCalled();
      expect(checkpointRepo.save).not.toHaveBeenCalled();
      // Rows are still deleted; only the cursor bookkeeping is skipped.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Max Batch Limit", () => {
    it("should stop after reaching maxBatch limit", async () => {
      const events = Array.from({ length: 50 }, (_, i) =>
        makeEvent(`f${i}`, 50 - i),
      );
      const eventRepo = createMockEventRepo(
        events.slice(0, 10),
        events.slice(10, 20),
        events.slice(20, 30),
      );
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "checkpoint-max",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        maxBatch: 2, // Stop after 2 batches
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.batchesProcessed).toBe(2);
      expect(result.totalArchived).toBe(20); // 2 batches * 10 records
      expect(result.reachedMaxBatch).toBe(true);
      expect(csvFiles().length).toBe(2);
    });

    it("leaves the checkpoint open when it stops at maxBatch", async () => {
      const events = Array.from({ length: 20 }, (_, i) =>
        makeEvent(`g${i}`, 50 - i),
      );
      const eventRepo = createMockEventRepo(events.slice(0, 10));
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "checkpoint-open",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        maxBatch: 1,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      const completed = checkpointRepo.save.mock.calls.filter(
        (call) => call[0]?.status === ArchiveJobStatus.COMPLETED,
      );
      expect(completed).toHaveLength(0);
    });

    it("should allow unlimited batches when maxBatch is undefined", async () => {
      const events = Array.from({ length: 15 }, (_, i) =>
        makeEvent(`h${i}`, 50 - i),
      );
      const eventRepo = createMockEventRepo(
        events.slice(0, 10),
        events.slice(10, 15),
      );
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "checkpoint-unlimited",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        maxBatch: undefined, // No limit
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.batchesProcessed).toBe(2);
      expect(result.totalArchived).toBe(15);
      expect(result.reachedMaxBatch).toBe(false);

      // A short final batch means the job is done -> checkpoint closed.
      const completed = checkpointRepo.save.mock.calls.filter(
        (call) => call[0]?.status === ArchiveJobStatus.COMPLETED,
      );
      expect(completed.length).toBeGreaterThan(0);
    });
  });

  describe("Dry-Run Validation", () => {
    it("should not modify database in dry-run mode", async () => {
      const eventRepo = createMockEventRepo([
        makeEvent("i1", 40),
        makeEvent("i2", 35),
      ]);
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir: tmpDir,
        resumeFromCheckpoint: false,
      });

      expect(result.totalArchived).toBe(2);
      expect(result.batchesProcessed).toBe(1);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(checkpointRepo.create).not.toHaveBeenCalled();
      expect(checkpointRepo.save).not.toHaveBeenCalled();

      // CSV is still produced so operators can validate the output.
      expect(csvFiles().length).toBe(1);
    });

    it("should report accurate metrics in dry-run mode", async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent(`j${i}`, 50 - i),
      );
      const eventRepo = createMockEventRepo(
        events.slice(0, 10),
        events.slice(10, 20),
        events.slice(20, 25),
      );
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir: tmpDir,
        resumeFromCheckpoint: false,
      });

      expect(result.totalArchived).toBe(25);
      expect(result.batchesProcessed).toBe(3);
      expect(result.filesCreated.length).toBe(3);
      expect(result.reachedMaxBatch).toBe(false);
      expect(csvFiles().length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty result set gracefully", async () => {
      const eventRepo = createMockEventRepo();
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: false,
      });

      expect(result.totalArchived).toBe(0);
      expect(result.batchesProcessed).toBe(0);
      expect(result.filesCreated.length).toBe(0);
    });

    it("should handle events with same timestamp correctly", async () => {
      const sameTimestamp = new Date(Date.now() - 40 * DAY_MS);
      const events = ["k1", "k2", "k3"].map((id) => {
        const event = makeEvent(id, 40);
        event.indexedAt = sameTimestamp;
        return event;
      });

      const eventRepo = createMockEventRepo(events);
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "checkpoint-same-ts",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.totalArchived).toBe(3);
      expect(result.batchesProcessed).toBe(1);

      // The last id is persisted so the next run can break the timestamp tie.
      const [manager] = dataSource.transactionManagers;
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.save.mock.calls[0][0].lastProcessedId).toBe("k3");
    });

    it("applies documented defaults when options are omitted", async () => {
      const eventRepo = createMockEventRepo();
      const checkpointRepo = createMockCheckpointRepo();
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        outDir: tmpDir,
      });

      // dryRun defaults to true, so nothing is deleted and no checkpoint is used.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(checkpointRepo.findOne).not.toHaveBeenCalled();
      expect(result.resumed).toBe(false);
      expect(eventRepo.queryBuilder.take).toHaveBeenCalledWith(500);
      expect(eventRepo.queryBuilder.where).toHaveBeenCalledWith(
        "event.indexedAt < :cutoff",
        { cutoff: cutoffFor(30) },
      );
    });
  });

  describe("Checkpoint Integrity Verification", () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("halts the run and throws when the stored hash is corrupted", async () => {
      const corrupt = "0".repeat(64);
      const checkpoint = buildCheckpoint({
        id: "cp-corrupt",
        batchNumber: 2,
        totalArchived: 100,
        integrityHash: corrupt,
      });

      const eventRepo = createMockEventRepo([makeEvent("corrupt-1", 60)]);
      const checkpointRepo = createMockCheckpointRepo({ existing: checkpoint });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      await expect(
        archiveOldRaffleEvents(dataSource, {
          retentionDays: 30,
          batchSize: 10,
          dryRun: false,
          outDir: tmpDir,
          resumeFromCheckpoint: true,
        }),
      ).rejects.toBeInstanceOf(ArchiveCheckpointIntegrityError);

      // Crucial invariant: NO archival work should have happened.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(csvFiles()).toHaveLength(0);

      // The checkpoint must be marked FAILED, original hash preserved.
      const savedFailing = checkpointRepo.save.mock.calls.find(
        (call) => call[0]?.status === ArchiveJobStatus.FAILED,
      );
      expect(savedFailing).toBeDefined();
      expect(savedFailing?.[0].integrityHash).toBe(corrupt);
      expect(savedFailing?.[0].verificationFailureReason).toMatch(/match/i);

      // Critical alert must be emitted with a stable, parseable JSON shape.
      const alertCall = errorSpy.mock.calls.find((call) => {
        try {
          return (
            JSON.parse(call[0] as string).alert ===
            "archive_checkpoint_integrity_mismatch"
          );
        } catch {
          return false;
        }
      });
      expect(alertCall).toBeDefined();
    });

    it("resumes successfully when the checkpoint's stored hash matches", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-happy",
        batchNumber: 1,
        totalArchived: 1,
        lastProcessedTimestamp: new Date(Date.now() - 50 * DAY_MS),
        lastProcessedId: "e1",
      });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);

      const eventRepo = createMockEventRepo([makeEvent("e2", 49)]);
      const checkpointRepo = createMockCheckpointRepo({ existing: checkpoint });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.resumed).toBe(true);
      expect(result.totalArchived).toBe(2);

      // Integrity verification succeeded -> lastVerifiedAt should be saved.
      const lastVerifiedSave = checkpointRepo.save.mock.calls.find(
        (call) =>
          call[0]?.id === "cp-happy" && call[0]?.lastVerifiedAt instanceof Date,
      );
      expect(lastVerifiedSave).toBeDefined();
    });

    it("treats a legacy checkpoint without integrityHash as a graceful migration", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-legacy",
        batchNumber: 1,
        totalArchived: 1,
        lastProcessedTimestamp: new Date(Date.now() - 50 * DAY_MS),
        lastProcessedId: "legacy-1",
        integrityHash: null, // legacy pre-migration state
      });

      const eventRepo = createMockEventRepo([makeEvent("legacy-2", 49)]);
      const checkpointRepo = createMockCheckpointRepo({ existing: checkpoint });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.resumed).toBe(true);
      expect(result.totalArchived).toBe(2);
    });

    it("computes and stores integrityHash on new checkpoint creation", async () => {
      const eventRepo = createMockEventRepo();
      const checkpointRepo = createMockCheckpointRepo({
        createdId: "cp-newly-created",
      });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      const createdSave = checkpointRepo.save.mock.calls.find(
        (call) => call[0]?.id === "cp-newly-created",
      );
      expect(createdSave).toBeDefined();
      expect(createdSave?.[0].integrityHash).toMatch(/^[0-9a-f]{64}$/);
      expect(createdSave?.[0].lastVerifiedAt).toBeInstanceOf(Date);
    });

    it("skips verification entirely when dryRun is true", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-dry",
        batchNumber: 2,
        totalArchived: 30,
        // Wrong hash -- verification must NOT fire in dryRun mode.
        integrityHash: "f".repeat(64),
      });

      const eventRepo = createMockEventRepo([makeEvent("dry-1", 60)]);
      const checkpointRepo = createMockCheckpointRepo({ existing: checkpoint });
      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.totalArchived).toBe(1);
      const failedSaves = checkpointRepo.save.mock.calls.filter(
        (call) => call[0]?.status === ArchiveJobStatus.FAILED,
      );
      expect(failedSaves).toHaveLength(0);
    });
  });
});
