import { EntityManager, In } from "typeorm";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { deleteArchivedRows, selectNextBatch } from "./batch-selector";
import {
  createMockEntityManager,
  createMockEventRepo,
  cutoffFor,
  DAY_MS,
  makeEvent,
} from "./testing/archive-fixtures";

describe("batch-selector", () => {
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("selectNextBatch", () => {
    it("filters on the cutoff and pages deterministically", async () => {
      const cutoff = cutoffFor(30);
      const repo = createMockEventRepo([makeEvent("a1", 40)]);

      const rows = await selectNextBatch(repo, {
        cutoff,
        batchSize: 10,
        lastProcessedTimestamp: null,
        lastProcessedId: null,
      });

      expect(rows.map((row) => row.id)).toEqual(["a1"]);
      expect(repo.queryBuilder.where).toHaveBeenCalledWith(
        "event.indexedAt < :cutoff",
        { cutoff },
      );
      // (indexedAt, id) ordering keeps the cursor stable across batches.
      expect(repo.queryBuilder.orderBy).toHaveBeenCalledWith(
        "event.indexedAt",
        "ASC",
      );
      expect(repo.queryBuilder.addOrderBy).toHaveBeenCalledWith(
        "event.id",
        "ASC",
      );
      expect(repo.queryBuilder.take).toHaveBeenCalledWith(10);
    });

    it("adds no cursor predicate on a fresh run", async () => {
      const repo = createMockEventRepo([]);

      await selectNextBatch(repo, {
        cutoff: cutoffFor(30),
        batchSize: 10,
        lastProcessedTimestamp: null,
        lastProcessedId: null,
      });

      expect(repo.queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it("resumes past the checkpoint cursor, breaking ties on id", async () => {
      const lastProcessedTimestamp = new Date(Date.now() - 40 * DAY_MS);
      const repo = createMockEventRepo([]);

      await selectNextBatch(repo, {
        cutoff: cutoffFor(30),
        batchSize: 25,
        lastProcessedTimestamp,
        lastProcessedId: "row-9",
      });

      expect(repo.queryBuilder.andWhere).toHaveBeenCalledWith(
        "(event.indexedAt > :lastTimestamp OR (event.indexedAt = :lastTimestamp AND event.id > :lastId))",
        { lastTimestamp: lastProcessedTimestamp, lastId: "row-9" },
      );
    });

    it("ignores a half-populated cursor", async () => {
      const repo = createMockEventRepo([]);

      await selectNextBatch(repo, {
        cutoff: cutoffFor(30),
        batchSize: 10,
        lastProcessedTimestamp: new Date(Date.now() - 40 * DAY_MS),
        lastProcessedId: null,
      });

      expect(repo.queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it("returns an empty batch once the table is exhausted", async () => {
      const repo = createMockEventRepo([makeEvent("a1", 40)]);
      const selection = {
        cutoff: cutoffFor(30),
        batchSize: 10,
        lastProcessedTimestamp: null,
        lastProcessedId: null,
      };

      await selectNextBatch(repo, selection);

      await expect(selectNextBatch(repo, selection)).resolves.toEqual([]);
    });
  });

  describe("deleteArchivedRows", () => {
    it("deletes exactly the archived ids", async () => {
      const manager = createMockEntityManager();
      const rows = [makeEvent("d1", 40), makeEvent("d2", 41)];

      await deleteArchivedRows(manager as unknown as EntityManager, rows);

      expect(manager.delete).toHaveBeenCalledWith(RaffleEventEntity, {
        id: In(["d1", "d2"]),
      });
    });
  });
});
