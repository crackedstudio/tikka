import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DataSource, In, Repository } from "typeorm";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../database/entities/archive-checkpoint.entity";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import {
  archiveChecksumPath,
  ArchiveIntegrityError,
  verifyArchiveChecksum,
} from "../../maintenance/archive/checksum";
import { verifyCheckpointIntegrity } from "../../maintenance/archive/integrity";
import {
  parseArchiveCsv,
  restoreRaffleEventsArchive,
} from "../../maintenance/archive/restore";
import { archiveOldRaffleEvents } from "../../maintenance/archive/runner";
import { toCsvLine } from "../../maintenance/archive/writer";
import {
  CONTAINER_STARTUP_MS,
  DbContainerContext,
  startDb,
  stopDb,
} from "./helpers/db-container";

/**
 * The archive round trip against real PostgreSQL.
 *
 * Archiving *deletes* rows, so the only thing that makes it safe is a restore
 * path that has actually been executed. This suite proves the whole loop on a
 * throwaway database:
 *
 *   seed → archive a range → assert the range is gone from `raffle_events`
 *   → restore it from the CSVs → assert the rows are byte-identical to what was
 *   archived → assert a tampered archive is rejected and imports nothing.
 *
 * It also pins the two boundary behaviours operators rely on: rows inside the
 * retention window are never touched, and a query spanning the boundary keeps
 * returning the rows that are still hot while the older range is archived.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;
const BATCH_SIZE = 4;

interface SeededEvent {
  id: string;
  txHash: string;
  indexedAt: Date;
  /** True when the row is older than the retention window at seed time. */
  archivable: boolean;
}

describe("archive → restore round trip", () => {
  let ctx: DbContainerContext;
  let ds: DataSource;
  let raffleEventRepo: Repository<RaffleEventEntity>;
  let checkpointRepo: Repository<ArchiveCheckpointEntity>;

  let outDir: string;
  let tmpDirs: string[] = [];

  beforeAll(async () => {
    ctx = await startDb();
    ds = ctx.dataSource;
    raffleEventRepo = ds.getRepository(RaffleEventEntity);
    checkpointRepo = ds.getRepository(ArchiveCheckpointEntity);
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    for (const dir of tmpDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    await stopDb(ctx);
  });

  beforeEach(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-roundtrip-"));
    tmpDirs.push(outDir);

    await ds.query(`SET session_replication_role = 'replica'`);
    await ds.query(
      `TRUNCATE TABLE raffle_events, archive_checkpoints RESTART IDENTITY CASCADE`,
    );
    await ds.query(`SET session_replication_role = 'origin'`);
  });

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * DAY_MS);
  }

  /** The cutoff `archiveOldRaffleEvents` will compute for this retention. */
  function approximateCutoff(): Date {
    return new Date(Date.now() - RETENTION_DAYS * DAY_MS);
  }

  function newTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-roundtrip-"));
    tmpDirs.push(dir);
    return dir;
  }

  async function seedEvent(options: {
    key: string;
    indexedAt: Date;
    archivable: boolean;
    contractAddress?: string | null;
    eventType?: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<SeededEvent> {
    const saved = await raffleEventRepo.save(
      raffleEventRepo.create({
        raffleId: 700,
        eventType: options.eventType ?? "TicketPurchased",
        contractAddress: options.contractAddress as unknown as string,
        schemaVersion: 1,
        ledger: 9000,
        txHash: `tx-${options.key}`,
        payloadJson: options.payloadJson ?? { key: options.key },
      }),
    );

    // `indexed_at` is a CreateDateColumn, so seed the archive age explicitly
    // rather than relying on the insert timestamp.
    await ds.query(`UPDATE raffle_events SET indexed_at = $1 WHERE id = $2`, [
      options.indexedAt,
      saved.id,
    ]);
    saved.indexedAt = options.indexedAt;

    return {
      id: saved.id,
      txHash: saved.txHash,
      indexedAt: options.indexedAt,
      archivable: options.archivable,
    };
  }

  /**
   * 10 rows: 6 clearly old, 1 just past the cutoff, and 3 that must survive
   * (1 just inside the cutoff, 2 recent). The two boundary rows sit an hour
   * either side of the cutoff so the comparison itself is under test.
   */
  async function seedBoundaryEvents(): Promise<SeededEvent[]> {
    const cutoff = approximateCutoff().getTime();
    const hour = 60 * 60 * 1000;

    return [
      await seedEvent({
        key: "old-1",
        indexedAt: daysAgo(45),
        archivable: true,
        contractAddress: "CCONTRACT1",
        payloadJson: { price: 10, note: "a,b" },
      }),
      await seedEvent({
        key: "old-2",
        indexedAt: daysAgo(44),
        archivable: true,
        contractAddress: null,
        payloadJson: { price: 11, nested: { buyer: "GAAA" } },
      }),
      await seedEvent({
        key: "old-3",
        indexedAt: daysAgo(43),
        archivable: true,
        eventType: "RaffleCreated",
        contractAddress: "CCONTRACT3",
        payloadJson: { max_tickets: 100 },
      }),
      await seedEvent({
        key: "old-4",
        indexedAt: daysAgo(42),
        archivable: true,
        contractAddress: "CCONTRACT4",
        payloadJson: { note: 'quote " inside' },
      }),
      await seedEvent({
        key: "old-5",
        indexedAt: daysAgo(41),
        archivable: true,
        payloadJson: { price: 12 },
      }),
      await seedEvent({
        key: "old-6",
        indexedAt: daysAgo(40),
        archivable: true,
        payloadJson: { price: 13 },
      }),
      await seedEvent({
        key: "boundary-past",
        indexedAt: new Date(cutoff - hour),
        archivable: true,
        payloadJson: { boundary: "just outside the window" },
      }),
      await seedEvent({
        key: "boundary-future",
        indexedAt: new Date(cutoff + hour),
        archivable: false,
        payloadJson: { boundary: "just inside the window" },
      }),
      await seedEvent({
        key: "recent-1",
        indexedAt: daysAgo(2),
        archivable: false,
        payloadJson: { price: 14 },
      }),
      await seedEvent({
        key: "recent-2",
        indexedAt: daysAgo(1),
        archivable: false,
        payloadJson: { price: 15 },
      }),
    ];
  }

  /**
   * The rows exactly as the archiver will write them, read back from the
   * database first so JSONB key ordering is the same on both sides of the
   * comparison. Sorted because one archive spans several batch files.
   */
  async function archivedCsvLines(ids: string[]): Promise<string[]> {
    const rows = await raffleEventRepo.find({
      where: { id: In(ids) },
      order: { indexedAt: "ASC" },
    });
    return rows.map(toCsvLine).sort();
  }

  function archived(events: SeededEvent[]): SeededEvent[] {
    return events.filter((event) => event.archivable);
  }

  function live(events: SeededEvent[]): SeededEvent[] {
    return events.filter((event) => !event.archivable);
  }

  async function hotTableIds(): Promise<string[]> {
    const rows = await raffleEventRepo.find();
    return rows.map((row) => row.id).sort();
  }

  /** Run the archiver destructively and return what it wrote. */
  async function archiveRange(dir: string) {
    return await archiveOldRaffleEvents(ds, {
      retentionDays: RETENTION_DAYS,
      batchSize: BATCH_SIZE,
      dryRun: false,
      outDir: dir,
      resumeFromCheckpoint: true,
    });
  }

  async function latestCheckpoint(): Promise<ArchiveCheckpointEntity> {
    const checkpoint = await checkpointRepo.findOne({
      where: { jobType: "raffle_events" },
      order: { startedAt: "DESC" },
    });
    if (!checkpoint) {
      throw new Error("Expected an archive checkpoint to exist");
    }
    return checkpoint;
  }

  it("archives a range, removes it from the hot table, then restores it byte-for-byte", async () => {
    const events = await seedBoundaryEvents();
    const toArchive = archived(events);
    const toKeep = live(events);
    const expectedLines = await archivedCsvLines(
      toArchive.map((event) => event.id),
    );
    expect(expectedLines).toHaveLength(7);

    const result = await archiveRange(outDir);

    expect(result.totalArchived).toBe(7);
    expect(result.batchesProcessed).toBe(2);
    expect(result.filesCreated).toHaveLength(2);

    // The archived range is gone; the live range is untouched.
    expect(await hotTableIds()).toEqual(toKeep.map((event) => event.id).sort());

    // The checkpoint is closed and its integrity hash still verifies, which is
    // what a resumed run (or a later restore) will check before trusting it.
    const checkpoint = await latestCheckpoint();
    expect(checkpoint.status).toBe(ArchiveJobStatus.COMPLETED);
    expect(checkpoint.totalArchived).toBe(7);
    expect(verifyCheckpointIntegrity(checkpoint).status).toBe("ok");

    // Every file is sealed with a checksum that verifies.
    for (const file of result.filesCreated) {
      expect(fs.existsSync(archiveChecksumPath(file))).toBe(true);
      await expect(verifyArchiveChecksum(file)).resolves.toMatchObject({
        status: "ok",
      });
    }

    const restore = await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });

    expect(restore.filesProcessed).toBe(2);
    expect(restore.rowsRead).toBe(7);
    expect(restore.rowsInserted).toBe(7);
    expect(restore.rowsAlreadyPresent).toBe(0);

    // Everything is back, and each restored row serializes to exactly the bytes
    // that were archived — including the NULL contract_address, the payload
    // containing a comma, and the embedded quote.
    expect(await hotTableIds()).toEqual(
      events.map((event) => event.id).sort(),
    );
    expect(await archivedCsvLines(toArchive.map((event) => event.id))).toEqual(
      expectedLines,
    );

    const restoredNullContract = await raffleEventRepo.findOneBy({
      txHash: "tx-old-2",
    });
    expect(restoredNullContract?.contractAddress).toBeNull();
    expect(restoredNullContract?.indexedAt.toISOString()).toBe(
      events.find((event) => event.txHash === "tx-old-2")!.indexedAt.toISOString(),
    );
  }, CONTAINER_STARTUP_MS);

  it("re-archiving the restored range reproduces the original files byte for byte", async () => {
    await seedBoundaryEvents();

    const first = await archiveRange(outDir);
    await restoreRaffleEventsArchive(ds, first.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });

    const secondDir = newTmpDir();
    const second = await archiveRange(secondDir);

    expect(second.filesCreated).toHaveLength(first.filesCreated.length);

    first.filesCreated.forEach((originalFile, index) => {
      const reArchived = second.filesCreated[index];

      expect(path.basename(reArchived)).toBe(path.basename(originalFile));
      expect(fs.readFileSync(reArchived).equals(fs.readFileSync(originalFile))).toBe(
        true,
      );
      expect(
        fs
          .readFileSync(archiveChecksumPath(reArchived))
          .equals(fs.readFileSync(archiveChecksumPath(originalFile))),
      ).toBe(true);
    });
  }, CONTAINER_STARTUP_MS);

  it("rejects a tampered archive and imports nothing", async () => {
    const events = await seedBoundaryEvents();

    const result = await archiveRange(outDir);
    await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });

    // Delete one archived batch again so an import of the tampered copy would
    // be visible as a row count change.
    const originalFile = result.filesCreated[0];
    const originalContent = fs.readFileSync(originalFile, "utf8");
    const batchIds = parseArchiveCsv(originalContent, originalFile).rows.map(
      (row) => row.id,
    );
    await ds.query(`DELETE FROM raffle_events WHERE id = ANY($1::uuid[])`, [
      batchIds,
    ]);

    const tamperedDir = newTmpDir();
    const tamperedPath = path.join(tamperedDir, path.basename(originalFile));
    fs.copyFileSync(originalFile, tamperedPath);
    // Keep the original sidecar beside the edited file: this is exactly the
    // "archive changed after it was written" case (partial S3 sync, hand edit).
    fs.copyFileSync(
      archiveChecksumPath(originalFile),
      archiveChecksumPath(tamperedPath),
    );
    fs.writeFileSync(
      tamperedPath,
      originalContent.replace("TicketPurchased", "TicketPurchased-Tampered"),
      "utf8",
    );

    const beforeCount = await raffleEventRepo.count();
    expect(beforeCount).toBe(events.length - batchIds.length);

    await expect(
      restoreRaffleEventsArchive(ds, [tamperedPath], { dryRun: false }),
    ).rejects.toBeInstanceOf(ArchiveIntegrityError);

    // Nothing was inserted: the batch is still missing and the table is intact.
    expect(await raffleEventRepo.count()).toBe(beforeCount);

    // The untouched original still restores, so the archive itself is fine.
    const restore = await restoreRaffleEventsArchive(ds, [originalFile], {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });
    expect(restore.rowsInserted).toBe(batchIds.length);
    expect(await raffleEventRepo.count()).toBe(events.length);
  }, CONTAINER_STARTUP_MS);

  it("refuses an archive with no checksum sidecar unless explicitly allowed", async () => {
    await seedBoundaryEvents();
    const result = await archiveRange(outDir);

    // Simulate an archive produced before checksums existed: the CSV without its
    // sidecar, as an old backup or a partial object-storage copy would look.
    const unverifiedDir = newTmpDir();
    const unverifiedPath = path.join(
      unverifiedDir,
      path.basename(result.filesCreated[0]),
    );
    fs.copyFileSync(result.filesCreated[0], unverifiedPath);

    const archivedCount = await raffleEventRepo.count();

    await expect(
      restoreRaffleEventsArchive(ds, [unverifiedPath], { dryRun: false }),
    ).rejects.toBeInstanceOf(ArchiveIntegrityError);
    expect(await raffleEventRepo.count()).toBe(archivedCount);

    const restore = await restoreRaffleEventsArchive(ds, [unverifiedPath], {
      dryRun: false,
      batchSize: BATCH_SIZE,
      allowMissingChecksum: true,
    });

    expect(restore.files[0].checksumStatus).toBe("missing");
    expect(restore.rowsInserted).toBeGreaterThan(0);
    expect(await raffleEventRepo.count()).toBeGreaterThan(archivedCount);
  }, CONTAINER_STARTUP_MS);

  it("is idempotent: restoring the same files twice does not duplicate rows", async () => {
    const events = await seedBoundaryEvents();
    const result = await archiveRange(outDir);

    const first = await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });
    const second = await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });

    expect(first.rowsInserted).toBe(7);
    expect(second.rowsInserted).toBe(0);
    expect(second.rowsAlreadyPresent).toBe(7);
    expect(await raffleEventRepo.count()).toBe(events.length);
  }, CONTAINER_STARTUP_MS);

  it("keeps queries spanning the archive boundary correct while a range is archived", async () => {
    const events = await seedBoundaryEvents();
    const toArchive = archived(events);
    const toKeep = live(events);
    const windowStart = daysAgo(60);
    const windowEnd = new Date(Date.now() + DAY_MS);

    const spanWindow = async (): Promise<string[]> => {
      const rows: RaffleEventEntity[] = await raffleEventRepo
        .createQueryBuilder("event")
        .where("event.indexedAt >= :windowStart", { windowStart })
        .andWhere("event.indexedAt < :windowEnd", { windowEnd })
        .orderBy("event.indexedAt", "ASC")
        .getMany();
      return rows.map((row) => row.id);
    };

    const beforeArchive = await spanWindow();
    expect(beforeArchive).toHaveLength(events.length);

    const result = await archiveRange(outDir);

    const whileArchived = await spanWindow();
    expect(whileArchived).toEqual(toKeep.map((event) => event.id));
    // The row an hour inside the window is still hot; the one an hour outside is
    // not — the cutoff comparison is what decides, not the batch boundary.
    expect(whileArchived).toContain(
      events.find((event) => event.txHash === "tx-boundary-future")!.id,
    );
    expect(whileArchived).not.toContain(
      events.find((event) => event.txHash === "tx-boundary-past")!.id,
    );
    expect(result.totalArchived).toBe(toArchive.length);

    await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: false,
      batchSize: BATCH_SIZE,
    });

    // Restoring puts the archived range back without disturbing the live rows.
    expect(await spanWindow()).toEqual(beforeArchive);
    expect(
      await raffleEventRepo.countBy({ id: In(toKeep.map((event) => event.id)) }),
    ).toBe(toKeep.length);
  }, CONTAINER_STARTUP_MS);

  it("previews a restore with a dry run without writing rows", async () => {
    await seedBoundaryEvents();
    const result = await archiveRange(outDir);
    const hotBefore = await raffleEventRepo.count();

    const preview = await restoreRaffleEventsArchive(ds, result.filesCreated, {
      dryRun: true,
      batchSize: BATCH_SIZE,
    });

    expect(preview.dryRun).toBe(true);
    expect(preview.rowsRead).toBe(7);
    expect(preview.rowsInserted).toBe(0);
    expect(preview.rowsAlreadyPresent).toBe(0);
    expect(await raffleEventRepo.count()).toBe(hotBefore);
  }, CONTAINER_STARTUP_MS);
});
