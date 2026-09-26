import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DataSource, EntityManager } from "typeorm";
import type { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { ArchiveIntegrityError, archiveChecksumPath } from "./checksum";
import {
  RESTORE_INSERT_COLUMNS,
  ArchiveFormatError,
  RAFFLE_EVENTS_TABLE,
  buildRestoreInsertQuery,
  insertArchivedRows,
  parseArchiveCsv,
  readArchiveFile,
  restoreRaffleEventsArchive,
} from "./restore";
import { makeEvent } from "./testing/archive-fixtures";
import {
  ARCHIVE_CSV_HEADER,
  LEGACY_ARCHIVE_CSV_HEADER,
  toCsvLine,
  writeBatchToCsv,
} from "./writer";

/**
 * Parsing and integrity behaviour of the restore path.
 *
 * Fixtures are produced with the real `toCsvLine`, so these specs exercise the
 * parser against exactly the escaping the archiver writes — including unquoted
 * JSON payloads, quoted fields containing commas, and doubled quotes.
 *
 * The database half of the round trip is covered by
 * `src/test/integration/archive-restore.integration.spec.ts`.
 */
describe("raffle events restore", () => {
  const ID_A = "11111111-1111-4111-8111-111111111111";
  const ID_B = "22222222-2222-4222-8222-222222222222";

  const header = ARCHIVE_CSV_HEADER.join(",");

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // Restore progress and integrity warnings are structured JSON on stdout.
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  /** A row exactly as the writer emits it, with any field overridden. */
  function lineFor(overrides: Partial<RaffleEventEntity> = {}): string {
    const event = makeEvent(ID_A, 40);
    Object.assign(event, {
      raffleId: 7,
      eventType: "RaffleCreated",
      schemaVersion: 1,
      ledger: 4242,
      txHash: "tx-abc",
      payloadJson: { price: 10 },
      contractAddress: "CCONTRACT",
      indexedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides,
    });
    return toCsvLine(event);
  }

  function archiveContent(...lines: string[]): string {
    return `${header}\n${lines.join("\n")}\n`;
  }

  /** Run `fn` and return the `ArchiveFormatError` it threw. */
  function formatErrorFrom(fn: () => unknown): ArchiveFormatError {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ArchiveFormatError);
      return error as ArchiveFormatError;
    }
    throw new Error("Expected ArchiveFormatError but nothing was thrown");
  }

  describe("parseArchiveCsv", () => {
    it("parses a row written by the archiver", () => {
      const parsed = parseArchiveCsv(archiveContent(lineFor()));

      expect(parsed.legacyHeader).toBe(false);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]).toEqual({
        id: ID_A,
        raffleId: 7,
        eventType: "RaffleCreated",
        contractAddress: "CCONTRACT",
        schemaVersion: 1,
        ledger: 4242,
        txHash: "tx-abc",
        payloadJson: { price: 10 },
        indexedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
    });

    it("parses quoted fields, doubled quotes and commas", () => {
      const parsed = parseArchiveCsv(
        archiveContent(
          lineFor({
            eventType: "Weird,Type",
            payloadJson: { note: "a,b" },
          }),
        ),
      );

      expect(parsed.rows[0].eventType).toBe("Weird,Type");
      expect(parsed.rows[0].payloadJson).toEqual({ note: "a,b" });
    });

    it("parses a payload that needs no quoting, quotes and all", () => {
      const parsed = parseArchiveCsv(
        archiveContent(lineFor({ payloadJson: { nested: { a: "b" } } })),
      );

      expect(parsed.rows[0].payloadJson).toEqual({ nested: { a: "b" } });
    });

    it("accepts the legacy header and restores contract_address as null", () => {
      const legacyLine = lineFor().replace(/,CCONTRACT$/, "");
      expect(legacyLine.endsWith("CCONTRACT")).toBe(false);

      const parsed = parseArchiveCsv(
        `${LEGACY_ARCHIVE_CSV_HEADER.join(",")}\n${legacyLine}\n`,
      );

      expect(parsed.legacyHeader).toBe(true);
      expect(parsed.rows[0].contractAddress).toBeNull();
      expect(parsed.rows[0].txHash).toBe("tx-abc");
    });

    it("keeps a null contract_address null rather than the string 'null'", () => {
      const parsed = parseArchiveCsv(
        archiveContent(
          lineFor({ contractAddress: null as unknown as string }),
        ),
      );

      expect(parsed.rows[0].contractAddress).toBeNull();
    });

    it("returns header-only archives as zero rows", () => {
      expect(parseArchiveCsv(`${header}\n`).rows).toEqual([]);
    });

    it("rejects an empty file", () => {
      expect(() => parseArchiveCsv("")).toThrow(ArchiveFormatError);
    });

    it("rejects an unknown header instead of guessing column positions", () => {
      expect(() =>
        parseArchiveCsv(`id,raffle_id,tx_hash\n${lineFor()}\n`),
      ).toThrow(/Unexpected archive header/);
    });

    it("rejects a reordered header", () => {
      const reordered = [
        "raffle_id",
        "id",
        ...ARCHIVE_CSV_HEADER.slice(2),
      ].join(",");

      expect(() => parseArchiveCsv(`${reordered}\n${lineFor()}\n`)).toThrow(
        /Unexpected archive header/,
      );
    });

    it("rejects a row with the wrong number of columns", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(`${header}\n${ID_A},7\n`),
      );

      expect(error.message).toContain("Expected 9 columns, found 2");
    });

    it("rejects a non-UUID id", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(archiveContent(lineFor({ id: "not-a-uuid" }))),
      );

      expect(error.message).toContain("must be a UUID");
    });

    it("rejects a non-integer ledger", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(
          archiveContent(lineFor({ ledger: "4242.5" as unknown as number })),
        ),
      );

      expect(error.message).toContain("must be an integer");
    });

    it("rejects a timestamp that is not a date", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(
          archiveContent(lineFor().replace("2026-01-01T00:00:00.000Z", "nope")),
        ),
      );

      expect(error.message).toContain("ISO-8601");
    });

    it("rejects an empty tx_hash and empty event_type", () => {
      expect(() =>
        parseArchiveCsv(archiveContent(lineFor({ txHash: "" }))),
      ).toThrow(/tx_hash/);
      expect(() =>
        parseArchiveCsv(archiveContent(lineFor({ eventType: "" }))),
      ).toThrow(/event_type/);
    });

    it("rejects a payload that is not valid JSON", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(
          archiveContent(lineFor().replace('{"price":10}', "{oops")),
        ),
      );

      expect(error.message).toContain("not valid JSON");
    });

    it("rejects a payload that is JSON but not an object", () => {
      const error = formatErrorFrom(() =>
        parseArchiveCsv(
          archiveContent(
            lineFor({ payloadJson: [1, 2] as unknown as Record<string, unknown> }),
          ),
        ),
      );

      expect(error.message).toContain("must be a JSON object");
    });

    it("defaults a missing schema_version to 1", () => {
      const parsed = parseArchiveCsv(
        archiveContent(lineFor({ schemaVersion: undefined as unknown as number })),
      );

      expect(parsed.rows[0].schemaVersion).toBe(1);
    });

    it("parses several rows and reports the line of a bad one", () => {
      const content = archiveContent(
        lineFor(),
        lineFor({ id: ID_B }),
        lineFor({ ledger: "nope" as unknown as number }),
      );

      const error = formatErrorFrom(() => parseArchiveCsv(content));

      expect(error.line).toBe(4);
      expect(error.message).toContain("line 4");
    });

    it("rejects an unterminated quoted field", () => {
      // Hand-crafted: the writer never emits an unterminated quote, so this is
      // the hand-edited-archive case where the record never closes.
      const content = `${header}\n${ID_A},"never closed\n`;

      const error = formatErrorFrom(() => parseArchiveCsv(content));

      expect(error.message).toContain("Unterminated quoted field");
    });
  });

  describe("readArchiveFile", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-restore-"));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("rejects a tampered archive before it is parsed", async () => {
      const file = path.join(tmpDir, "batch0001.csv");
      fs.writeFileSync(file, archiveContent(lineFor()), "utf8");
      fs.writeFileSync(
        archiveChecksumPath(file),
        `${"f".repeat(64)}  batch0001.csv\n`,
        "utf8",
      );

      await expect(readArchiveFile(file)).rejects.toBeInstanceOf(
        ArchiveIntegrityError,
      );
    });

    it("reads back a file the archiver just wrote, field for field", async () => {
      const event = makeEvent(ID_A, 40);
      Object.assign(event, {
        raffleId: 7,
        eventType: "RaffleCreated",
        schemaVersion: 1,
        ledger: 4242,
        txHash: "tx-abc",
        payloadJson: { price: 10 },
        contractAddress: "CCONTRACT",
        indexedAt: new Date("2026-01-01T00:00:00.000Z"),
      });

      const file = await writeBatchToCsv([event], {
        outDir: tmpDir,
        cutoff: new Date("2025-12-01T00:00:00.000Z"),
        batchNumber: 1,
        dryRun: false,
      });

      const parsed = await readArchiveFile(file);

      expect(parsed.checksumStatus).toBe("ok");
      expect(parsed.rows).toEqual([
        {
          id: ID_A,
          raffleId: 7,
          eventType: "RaffleCreated",
          contractAddress: "CCONTRACT",
          schemaVersion: 1,
          ledger: 4242,
          txHash: "tx-abc",
          payloadJson: { price: 10 },
          indexedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]);
    });

    it("rejects a missing archive", async () => {
      await expect(
        readArchiveFile(path.join(tmpDir, "nope.csv")),
      ).rejects.toBeInstanceOf(ArchiveFormatError);
    });

    it("reports an unverified legacy archive as missing, not ok", async () => {
      const file = path.join(tmpDir, "legacy.csv");
      fs.writeFileSync(file, archiveContent(lineFor()), "utf8");

      await expect(readArchiveFile(file)).rejects.toBeInstanceOf(
        ArchiveIntegrityError,
      );

      const parsed = await readArchiveFile(file, {
        allowMissingChecksum: true,
      });
      expect(parsed.checksumStatus).toBe("missing");
      expect(parsed.rows).toHaveLength(1);
    });
  });

  describe("insert SQL", () => {
    it("lists the archiver's columns and binds one placeholder per value", () => {
      const sql = buildRestoreInsertQuery(2);

      expect(sql).toContain(
        `INSERT INTO ${RAFFLE_EVENTS_TABLE} (${RESTORE_INSERT_COLUMNS.join(", ")})`,
      );
      expect(sql).toContain(
        "($1, $2, $3, $4, $5, $6, $7, $8, $9), ($10, $11, $12, $13, $14, $15, $16, $17, $18)",
      );
      // Target-less so both the tx_hash idempotency key and the id primary key
      // make a re-run a no-op.
      expect(sql).toContain("ON CONFLICT DO NOTHING");
      expect(sql).toContain("RETURNING id");
    });
  });

  describe("insertArchivedRows", () => {
    function parsedRow(id: string, txHash: string) {
      return {
        id,
        raffleId: 1,
        eventType: "RaffleCreated",
        contractAddress: null,
        schemaVersion: 1,
        ledger: 1,
        txHash,
        payloadJson: { n: 1 },
        indexedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    }

    it("chunks inserts and counts rows the database actually wrote", async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: ID_A }])
        .mockResolvedValueOnce([{ id: ID_B }]);
      const manager = { query } as unknown as EntityManager;

      const result = await insertArchivedRows(
        manager,
        [parsedRow(ID_A, "tx-a"), parsedRow(ID_B, "tx-b")],
        1,
      );

      expect(result).toEqual({ inserted: 2, alreadyPresent: 0 });
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0][0]).toContain(
        "($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      );
      expect(query.mock.calls[0][1]).toEqual([
        ID_A,
        1,
        "RaffleCreated",
        1,
        1,
        "tx-a",
        '{"n":1}',
        "2026-01-01T00:00:00.000Z",
        null,
      ]);
    });

    it("counts a conflicting row as already present instead of failing", async () => {
      const query = jest.fn().mockResolvedValue([]);
      const manager = { query } as unknown as EntityManager;

      const result = await insertArchivedRows(
        manager,
        [parsedRow(ID_A, "tx-a")],
        500,
      );

      expect(result).toEqual({ inserted: 0, alreadyPresent: 1 });
    });
  });

  describe("restoreRaffleEventsArchive", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-restore-"));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    /** DataSource double whose transaction hands the manager to the callback. */
    function dataSourceWith(manager: EntityManager): DataSource {
      return {
        transaction: jest.fn(
          async (callback: (m: EntityManager) => Promise<unknown>) =>
            await callback(manager),
        ),
      } as unknown as DataSource;
    }

    /** An archive file complete with the sidecar the archiver would write. */
    function archiveFile(name: string, content: string): string {
      const file = path.join(tmpDir, name);
      fs.writeFileSync(file, content, "utf8");
      const digest = crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex");
      fs.writeFileSync(
        archiveChecksumPath(file),
        `${digest}  ${name}\n`,
        "utf8",
      );
      return file;
    }

    it("reports what a dry run would insert without writing", async () => {
      const query = jest.fn().mockResolvedValue([{ id: ID_A }]);
      const manager = { query } as unknown as EntityManager;
      const file = archiveFile("batch0001.csv", archiveContent(lineFor()));

      const result = await restoreRaffleEventsArchive(
        dataSourceWith(manager),
        [file],
        { dryRun: true },
      );

      expect(result).toMatchObject({
        dryRun: true,
        filesProcessed: 1,
        rowsRead: 1,
        rowsInserted: 0,
        rowsAlreadyPresent: 1,
      });
      expect(query.mock.calls[0][0]).toContain("SELECT id FROM");
    });

    it("inserts when not a dry run", async () => {
      const query = jest.fn().mockResolvedValue([{ id: ID_A }]);
      const manager = { query } as unknown as EntityManager;
      const file = archiveFile("batch0001.csv", archiveContent(lineFor()));

      const result = await restoreRaffleEventsArchive(
        dataSourceWith(manager),
        [file],
        { dryRun: false },
      );

      expect(result).toMatchObject({
        dryRun: false,
        rowsRead: 1,
        rowsInserted: 1,
        rowsAlreadyPresent: 0,
      });
      expect(result.files[0].checksumStatus).toBe("ok");
    });

    it("stops on an unverifiable file without touching the database", async () => {
      const query = jest.fn();
      const manager = { query } as unknown as EntityManager;
      const file = archiveFile("batch0001.csv", archiveContent(lineFor()));
      // Same file, edited after the sidecar was written.
      fs.writeFileSync(
        file,
        archiveContent(lineFor({ txHash: "tx-edited" })),
        "utf8",
      );

      await expect(
        restoreRaffleEventsArchive(dataSourceWith(manager), [file], {
          dryRun: false,
        }),
      ).rejects.toBeInstanceOf(ArchiveIntegrityError);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
