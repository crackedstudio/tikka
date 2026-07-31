import {
  archiveOldRaffleEvents,
  ArchiveResult,
  ArchiveCheckpointIntegrityError,
  computeIntegrityHash,
  verifyCheckpointIntegrity,
} from "./archive-raffle-events";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../database/entities/archive-checkpoint.entity";
import { DataSource, Repository } from "typeorm";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeEvent(
  id: string,
  daysOld: number,
  raffleId: number = 1,
): RaffleEventEntity {
  const e = new RaffleEventEntity();
  e.id = id;
  e.raffleId = raffleId;
  e.eventType = "RaffleCreated";
  e.schemaVersion = 1;
  e.ledger = 100;
  e.txHash = `tx-${id}`;
  e.payloadJson = { price: 10, max_tickets: 100 };
  e.indexedAt = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return e;
}

function createMockDataSource(
  eventRepo: Repository<RaffleEventEntity>,
  checkpointRepo: Repository<ArchiveCheckpointEntity>,
): DataSource {
  const mockDataSource = {
    getRepository: jest.fn((entity: any) => {
      if (entity === RaffleEventEntity) return eventRepo;
      if (entity === ArchiveCheckpointEntity) return checkpointRepo;
      throw new Error(`Unknown entity: ${entity}`);
    }),
    transaction: jest.fn(async (callback: any) => {
      const mockManager = {
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      };
      return await callback(mockManager);
    }),
  } as any;

  return mockDataSource;
}

describe("archiveOldRaffleEvents", () => {
  let tmpDir: string;

  // Freeze Date.now() for the entire test suite so any fixture that captures
  // `new Date(Date.now() - …)` matches exactly the cutoff that
  // archiveOldRaffleEvents computes from `retentionDays`. Under real time
  // the difference between fixture-time and call-time Date.now() can drift
  // by several ms, causing the resumption code path to mis-identify a same-
  // cutoff checkpoint as belonging to a previous run.
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    jest.useRealTimers();
  });

  describe("Basic Archiving", () => {
    it("should write CSV and delete rows when not dryRun", async () => {
      const old1 = makeEvent("a1", 40);
      const old2 = makeEvent("a2", 31);
      const recent = makeEvent("r1", 5);

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([old1, old2])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "checkpoint-1",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify CSV file was created
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
      expect(files.length).toBe(1);

      // Verify CSV content
      const csvContent = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(csvContent).toContain("id,raffle_id,event_type");
      expect(csvContent).toContain("a1");
      expect(csvContent).toContain("a2");

      // Verify transaction was called for deletion
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it("should not delete when dryRun is true", async () => {
      const old1 = makeEvent("b1", 60);

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([old1])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        save: jest.fn(),
      } as any;

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

      // Verify transaction was NOT called (no deletion in dry-run)
      expect(dataSource.transaction).not.toHaveBeenCalled();

      // Verify checkpoint was NOT created in dry-run
      expect(checkpointRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("Checkpoint Resumption", () => {
    it("should resume from existing checkpoint after interruption", async () => {
      const batch1Event1 = makeEvent("c1", 50);
      const batch1Event2 = makeEvent("c2", 49);
      const batch2Event1 = makeEvent("c3", 48);
      const batch2Event2 = makeEvent("c4", 47);

      // Simulate existing checkpoint from previous run
      const existingCheckpoint: ArchiveCheckpointEntity = {
        id: "checkpoint-existing",
        jobType: "raffle_events",
        lastProcessedTimestamp: batch1Event2.indexedAt,
        lastProcessedId: batch1Event2.id,
        totalArchived: 2,
        batchNumber: 1,
        status: ArchiveJobStatus.IN_PROGRESS,
        configSnapshot: {
          retentionDays: 30,
          batchSize: 10,
          cutoffDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([batch2Event1, batch2Event2])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(existingCheckpoint),
        create: jest.fn(),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify checkpoint was updated
      expect(checkpointRepo.save).toHaveBeenCalled();
    });

    it("should handle partial batch interruption correctly", async () => {
      // Simulate scenario where batch 1 was partially processed
      const processedEvent = makeEvent("d1", 60);
      const unprocessedEvent1 = makeEvent("d2", 59);
      const unprocessedEvent2 = makeEvent("d3", 58);

      const existingCheckpoint: ArchiveCheckpointEntity = {
        id: "checkpoint-partial",
        jobType: "raffle_events",
        lastProcessedTimestamp: processedEvent.indexedAt,
        lastProcessedId: processedEvent.id,
        totalArchived: 1,
        batchNumber: 1,
        status: ArchiveJobStatus.IN_PROGRESS,
        configSnapshot: {
          retentionDays: 30,
          batchSize: 10,
          cutoffDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([unprocessedEvent1, unprocessedEvent2])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(existingCheckpoint),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify query builder was called with resume parameters
      const queryBuilder = eventRepo.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("event.indexedAt > :lastTimestamp"),
        expect.objectContaining({
          lastTimestamp: processedEvent.indexedAt,
          lastId: processedEvent.id,
        }),
      );
    });

    it("should not duplicate processing when resuming", async () => {
      const event1 = makeEvent("e1", 50);
      const event2 = makeEvent("e2", 49);

      const existingCheckpoint: ArchiveCheckpointEntity = {
        id: "checkpoint-no-dup",
        jobType: "raffle_events",
        lastProcessedTimestamp: event1.indexedAt,
        lastProcessedId: event1.id,
        totalArchived: 1,
        batchNumber: 1,
        status: ArchiveJobStatus.IN_PROGRESS,
        configSnapshot: {
          retentionDays: 30,
          batchSize: 10,
          cutoffDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([event2]) // Only event2, not event1
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(existingCheckpoint),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify only 1 file was created in this run (not re-processing event1)
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
      expect(files.length).toBe(1);

      const csvContent = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
      expect(csvContent).toContain("e2");
      expect(csvContent).not.toContain("e1"); // Should not re-process
    });
  });

  describe("Max Batch Limit", () => {
    it("should stop after reaching maxBatch limit", async () => {
      const events = Array.from({ length: 50 }, (_, i) =>
        makeEvent(`f${i}`, 50 - i),
      );

      let callCount = 0;
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 3) {
              return Promise.resolve(events.slice((callCount - 1) * 10, callCount * 10));
            }
            return Promise.resolve([]);
          }),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "checkpoint-max",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify only 2 files were created
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
      expect(files.length).toBe(2);
    });

    it("should allow unlimited batches when maxBatch is undefined", async () => {
      const events = Array.from({ length: 15 }, (_, i) =>
        makeEvent(`g${i}`, 50 - i),
      );

      let callCount = 0;
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(events.slice(0, 10));
            if (callCount === 2) return Promise.resolve(events.slice(10, 15));
            return Promise.resolve([]);
          }),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "checkpoint-unlimited",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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
    });
  });

  describe("Dry-Run Validation", () => {
    it("should not modify database in dry-run mode", async () => {
      const old1 = makeEvent("h1", 40);
      const old2 = makeEvent("h2", 35);

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([old1, old2])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any;

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

      // Verify no database modifications
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(checkpointRepo.create).not.toHaveBeenCalled();
      expect(checkpointRepo.save).not.toHaveBeenCalled();

      // Verify CSV was still created
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
      expect(files.length).toBe(1);
    });

    it("should report accurate metrics in dry-run mode", async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        makeEvent(`i${i}`, 50 - i),
      );

      let callCount = 0;
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(events.slice(0, 10));
            if (callCount === 2) return Promise.resolve(events.slice(10, 20));
            if (callCount === 3) return Promise.resolve(events.slice(20, 25));
            return Promise.resolve([]);
          }),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any;

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

      // Verify all CSV files were created
      const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
      expect(files.length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty result set gracefully", async () => {
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        save: jest.fn(),
      } as any;

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
      const sameTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const event1 = makeEvent("j1", 40);
      const event2 = makeEvent("j2", 40);
      const event3 = makeEvent("j3", 40);
      event1.indexedAt = sameTimestamp;
      event2.indexedAt = sameTimestamp;
      event3.indexedAt = sameTimestamp;

      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce([event1, event2, event3])
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "checkpoint-same-ts",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

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

      // Verify checkpoint saved last ID for tie-breaking
      expect(checkpointRepo.save).toHaveBeenCalled();
      const savedCheckpoint = checkpointRepo.save.mock.calls[0][0];
      expect(savedCheckpoint.lastProcessedId).toBe("j3");
    });
  });

  describe("Checkpoint Integrity Verification", () => {
    // Freeze Date.now() so the fixture's configSnapshot.cutoffDate matches
    // EXACTLY what archiveOldRaffleEvents computes from retentionDays=30.
    // Use jest.useFakeTimers / useRealTimers pair so the global Date object
    // is cleanly restored for sibling tests in other describe blocks and
    // doesn't leak Date.now() overrides into the rest of the file.
    const fixedNow = new Date("2026-01-15T12:00:00.000Z");
    let cutoff: Date;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
      cutoff = new Date(fixedNow.getTime() - 30 * 24 * 60 * 60 * 1000);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Builds a checkpoint with batchNumber > 0 (a state that *would* trigger
     * resume-time verification) and a pre-computed integrity hash matching
     * the row. Override `integrityHash` post-hoc to simulate corruption.
     */
    function buildCheckpoint(
      overrides: Partial<ArchiveCheckpointEntity> = {},
    ): ArchiveCheckpointEntity {
      const cp: ArchiveCheckpointEntity = {
        id: overrides.id ?? "cp-verify",
        jobType: "raffle_events",
        lastProcessedTimestamp: overrides.lastProcessedTimestamp ?? null,
        lastProcessedId: overrides.lastProcessedId ?? null,
        totalArchived: overrides.totalArchived ?? 0,
        batchNumber: overrides.batchNumber ?? 1,
        status: ArchiveJobStatus.IN_PROGRESS,
        configSnapshot: overrides.configSnapshot ?? {
          retentionDays: 30,
          batchSize: 10,
          cutoffDate: cutoff.toISOString(),
        },
        startedAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        integrityHash: overrides.integrityHash ?? null,
        lastVerifiedAt: overrides.lastVerifiedAt ?? null,
        verificationFailureReason: overrides.verificationFailureReason ?? null,
      };
      return cp;
    }

    function buildMocks(
      checkpoint: ArchiveCheckpointEntity | null,
      eventRows: RaffleEventEntity[] = [],
    ) {
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest
            .fn()
            .mockResolvedValueOnce(eventRows)
            .mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(checkpoint),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "cp-new",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

      return {
        eventRepo,
        checkpointRepo,
        dataSource: createMockDataSource(eventRepo, checkpointRepo),
      };
    }

    it("halts the service and throws ArchiveCheckpointIntegrityError when the stored hash is corrupted", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const clean = buildCheckpoint({
          id: "cp-corrupt",
          batchNumber: 2,
          totalArchived: 100,
          integrityHash: computeIntegrityHash(
            buildCheckpoint({ batchNumber: 2, totalArchived: 100 }),
          ),
        });
        // Inject corruption: row state stays valid, but the integrity hash is
        // overwritten with an unrelated value (by a buggy tool / SQL UPDATE).
        clean.integrityHash =
          "0000000000000000000000000000000000000000000000000000000000000000";

        const oldEvent = makeEvent("corrupt-1", 60);
        const { dataSource, checkpointRepo } = buildMocks(clean, [oldEvent]);

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
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".csv"));
        expect(files).toHaveLength(0);

        // The checkpoint must be marked FAILED, original hash preserved.
        const savedFailing = checkpointRepo.save.mock.calls.find(
          (call: any[]) => call[0]?.status === ArchiveJobStatus.FAILED,
        );
        expect(savedFailing).toBeDefined();
        expect(savedFailing![0].integrityHash).toBe(
          "0000000000000000000000000000000000000000000000000000000000000000",
        );
        expect(savedFailing![0].verificationFailureReason).toMatch(/match/i);

        // Critical alert must be emitted with a stable, parseable JSON shape.
        const alertCall = consoleErrorSpy.mock.calls.find((call: any[]) => {
          try {
            const parsed = JSON.parse(call[0]);
            return parsed.alert === "archive_checkpoint_integrity_mismatch";
          } catch {
            return false;
          }
        });
        expect(alertCall).toBeDefined();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it("throws with informative fields exposing checkpoint id and hashes", async () => {
      const clean = buildCheckpoint({
        id: "cp-fields",
        batchNumber: 1,
        totalArchived: 50,
        integrityHash: computeIntegrityHash(
          buildCheckpoint({ batchNumber: 1, totalArchived: 50 }),
        ),
      });
      clean.integrityHash = "deadbeef".repeat(8); // 64 chars, but doesn't match

      const { dataSource } = buildMocks(clean, []);

      try {
        await archiveOldRaffleEvents(dataSource, {
          retentionDays: 30,
          batchSize: 10,
          dryRun: false,
          outDir: tmpDir,
          resumeFromCheckpoint: true,
        });
        throw new Error("Expected archiveOldRaffleEvents to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ArchiveCheckpointIntegrityError);
        const e = err as ArchiveCheckpointIntegrityError;
        expect(e.checkpointId).toBe("cp-fields");
        expect(e.expectedHash).toBe("deadbeef".repeat(8));
        expect(e.actualHash).toMatch(/^[0-9a-f]{64}$/);
        expect(e.reason).toMatch(/match/i);
      }
    });

    it("resumes successfully when the checkpoint's stored hash matches computed hash", async () => {
      const ts = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
      const checkpoint = buildCheckpoint({
        id: "cp-happy",
        batchNumber: 1,
        totalArchived: 1,
        lastProcessedTimestamp: ts,
        lastProcessedId: "e1",
        status: ArchiveJobStatus.IN_PROGRESS,
      });
      checkpoint.integrityHash = computeIntegrityHash(checkpoint);

      const oldEvent = makeEvent("e2", 49);
      const { dataSource, checkpointRepo } = buildMocks(checkpoint, [oldEvent]);

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

    it("treats a legacy checkpoint without integruityHash as a graceful migration (does not halt)", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-legacy",
        batchNumber: 1,
        totalArchived: 1,
        lastProcessedTimestamp: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
        lastProcessedId: "legacy-1",
        integrityHash: null, // legacy pre-migration state
      });

      const oldEvent = makeEvent("legacy-2", 49);
      const { dataSource } = buildMocks(checkpoint, [oldEvent]);

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

    it("computeIntegrityHash returns the same value across calls (deterministic)", () => {
      const cp = buildCheckpoint({
        batchNumber: 3,
        totalArchived: 200,
        lastProcessedTimestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        lastProcessedId: "det-1",
      });
      const a = computeIntegrityHash(cp);
      const b = computeIntegrityHash(cp);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("computeIntegrityHash changes when checkpoint state changes", () => {
      const cp = buildCheckpoint({ batchNumber: 3, totalArchived: 200 });
      const before = computeIntegrityHash(cp);
      cp.totalArchived = 201;
      const after = computeIntegrityHash(cp);
      expect(before).not.toBe(after);
    });

    it("verifyCheckpointIntegrity returns 'failed' for a corrupted hash", () => {
      const cp = buildCheckpoint({ batchNumber: 1, totalArchived: 10 });
      cp.integrityHash = computeIntegrityHash(cp);
      cp.integrityHash = "0".repeat(64);
      const result = verifyCheckpointIntegrity(cp);
      expect(result.status).toBe("failed");
      expect(result.reason).toMatch(/match/i);
    });

    it("verifyCheckpointIntegrity returns 'ok' when hashes match", () => {
      const cp = buildCheckpoint({ batchNumber: 1, totalArchived: 10 });
      cp.integrityHash = computeIntegrityHash(cp);
      const result = verifyCheckpointIntegrity(cp);
      expect(result.status).toBe("ok");
    });

    it("verifyCheckpointIntegrity returns 'missing' for null/undefined hash (legacy)", () => {
      const cpNull = buildCheckpoint({ batchNumber: 1, totalArchived: 10 });
      cpNull.integrityHash = null;
      expect(verifyCheckpointIntegrity(cpNull).status).toBe("missing");

      const cpUndef = buildCheckpoint({ batchNumber: 1, totalArchived: 10 });
      // @ts-expect-error: intentionally bypass type for legacy emulation
      cpUndef.integrityHash = undefined;
      expect(verifyCheckpointIntegrity(cpUndef).status).toBe("missing");
    });

    it("computes and stores integrityHash on new checkpoint creation", async () => {
      const eventRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValueOnce([]),
        }),
      } as any;

      const checkpointRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data: any) => ({
          ...data,
          id: "cp-newly-created",
        })),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      } as any;

      const dataSource = createMockDataSource(eventRepo, checkpointRepo);

      await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: false,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      // The new checkpoint is created with id "cp-newly-created" and the
      // integrity hash + lastVerifiedAt are populated between create() and
      // save(), so the first save() call carries all three properties.
      const createdSave = checkpointRepo.save.mock.calls.find(
        (call: any[]) => call[0]?.id === "cp-newly-created",
      );
      expect(createdSave).toBeDefined();
      expect(createdSave![0].integrityHash).toMatch(/^[0-9a-f]{64}$/);
      expect(createdSave![0].lastVerifiedAt).toBeInstanceOf(Date);
    });

    it("skips verification entirely when dryRun is true", async () => {
      const checkpoint = buildCheckpoint({
        id: "cp-dry",
        batchNumber: 2,
        totalArchived: 30,
      });
      // Give a wrong hash -- verification must NOT fire in dryRun mode.
      checkpoint.integrityHash = "f".repeat(64);

      const oldEvent = makeEvent("dry-1", 60);
      const { dataSource, checkpointRepo } = buildMocks(checkpoint, [oldEvent]);

      const result = await archiveOldRaffleEvents(dataSource, {
        retentionDays: 30,
        batchSize: 10,
        dryRun: true,
        outDir: tmpDir,
        resumeFromCheckpoint: true,
      });

      expect(result.totalArchived).toBe(1);
      // No FAILED mark should have been written during dry-run.
      const failedSaves = checkpointRepo.save.mock.calls.filter(
        (call) => call[0]?.status === ArchiveJobStatus.FAILED,
      );
      expect(failedSaves).toHaveLength(0);
    });
  });
});
