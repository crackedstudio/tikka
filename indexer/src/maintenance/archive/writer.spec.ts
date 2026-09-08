import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ARCHIVE_CSV_HEADER,
  archiveFilePath,
  defaultArchiveDir,
  ensureArchiveDir,
  toCsvLine,
  writeBatchToCsv,
} from "./writer";
import { makeEvent } from "./testing/archive-fixtures";

describe("archive writer", () => {
  let tmpDir: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-writer-"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("paths", () => {
    it("names files by cutoff date and zero-padded batch number", () => {
      const cutoff = new Date("2026-01-15T12:00:00.000Z");

      expect(archiveFilePath("/out", cutoff, 7)).toBe(
        "/out/raffle_events_2026-01-15_batch0007.csv",
      );
      expect(archiveFilePath("/out", cutoff, 1234)).toBe(
        "/out/raffle_events_2026-01-15_batch1234.csv",
      );
    });

    it("defaults to ./archives under the working directory", () => {
      expect(defaultArchiveDir()).toBe(path.join(process.cwd(), "archives"));
    });

    it("creates nested output directories and tolerates existing ones", () => {
      const nested = path.join(tmpDir, "a", "b");

      ensureArchiveDir(nested);
      ensureArchiveDir(nested);

      expect(fs.existsSync(nested)).toBe(true);
    });
  });

  describe("toCsvLine", () => {
    it("emits columns in header order", () => {
      const event = makeEvent("row-1", 40, 42);
      event.ledger = 900;
      event.txHash = "tx-abc";
      event.indexedAt = new Date("2026-01-01T00:00:00.000Z");

      expect(toCsvLine(event)).toBe(
        [
          "row-1",
          "42",
          "RaffleCreated",
          "1",
          "900",
          "tx-abc",
          '"{""price"":10,""max_tickets"":100}"',
          "2026-01-01T00:00:00.000Z",
        ].join(","),
      );
    });

    it("quotes only fields containing a comma and doubles inner quotes", () => {
      const event = makeEvent("row-2", 40);
      event.eventType = "Weird,Type";
      event.txHash = 'tx-"quoted"';
      event.payloadJson = { note: "a" };

      const line = toCsvLine(event);

      expect(line).toContain('"Weird,Type"');
      // No comma in txHash or payload, so both are written verbatim.
      expect(line).toContain('tx-"quoted"');
      expect(line).toContain('{"note":"a"}');
    });

    it("keeps one row on one physical line", () => {
      const event = makeEvent("row-3", 40);
      event.payloadJson = { memo: "line1\nline2\r\nline3" };

      const line = toCsvLine(event);

      expect(line).not.toMatch(/[\n\r]/);
      expect(line).toContain("line1\\nline2");
    });

    it("defaults a missing schema version to 1", () => {
      const event = makeEvent("row-4", 40);
      event.schemaVersion = undefined as unknown as number;

      expect(toCsvLine(event).split(",")[3]).toBe("1");
    });
  });

  describe("writeBatchToCsv", () => {
    const cutoff = new Date("2026-01-15T12:00:00.000Z");

    it("writes a header plus one line per row", async () => {
      const rows = [makeEvent("w1", 40), makeEvent("w2", 41)];

      const file = await writeBatchToCsv(rows, {
        outDir: tmpDir,
        cutoff,
        batchNumber: 1,
        dryRun: false,
      });

      const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n");
      expect(lines[0]).toBe(ARCHIVE_CSV_HEADER.join(","));
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain("w1");
      expect(lines[2]).toContain("w2");
    });

    it("still writes the CSV in dry-run mode so operators can validate output", async () => {
      const file = await writeBatchToCsv([makeEvent("w3", 40)], {
        outDir: tmpDir,
        cutoff,
        batchNumber: 2,
        dryRun: true,
      });

      expect(fs.existsSync(file)).toBe(true);
      expect(
        logSpy.mock.calls.some((call) => String(call[0]).includes("[DRY-RUN]")),
      ).toBe(true);
    });

    it("writes a header-only file for an empty batch", async () => {
      const file = await writeBatchToCsv([], {
        outDir: tmpDir,
        cutoff,
        batchNumber: 3,
        dryRun: false,
      });

      expect(fs.readFileSync(file, "utf8")).toBe(
        ARCHIVE_CSV_HEADER.join(",") + "\n",
      );
    });
  });
});
