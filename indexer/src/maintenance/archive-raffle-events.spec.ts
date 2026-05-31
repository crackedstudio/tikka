import { archiveOldRaffleEvents, ArchiveResult } from "./archive-raffle-events";
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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
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
});
