import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RESTORE_DEFAULTS } from "./restore";
import {
  discoverArchiveFiles,
  parseRestoreCliOptions,
} from "./restore-cli";

/**
 * Environment parsing and file discovery for `npm run restore:raffle-events`.
 * A restore that silently picks up the wrong files is worse than one that
 * refuses to run, so both of these fail loudly.
 */
describe("restore CLI options", () => {
  it("defaults to a dry run over ./archives", () => {
    expect(parseRestoreCliOptions({})).toEqual({
      dir: path.join(process.cwd(), "archives"),
      files: undefined,
      dryRun: RESTORE_DEFAULTS.dryRun,
      batchSize: RESTORE_DEFAULTS.batchSize,
      allowMissingChecksum: false,
    });
  });

  it("only DRY_RUN=false enables writes, so a typo cannot write rows", () => {
    expect(parseRestoreCliOptions({ DRY_RUN: "false" }).dryRun).toBe(false);
    expect(parseRestoreCliOptions({ DRY_RUN: "no" }).dryRun).toBe(true);
    expect(parseRestoreCliOptions({ DRY_RUN: "0" }).dryRun).toBe(true);
  });

  it("reads an explicit file list from ARCHIVE_FILES", () => {
    const options = parseRestoreCliOptions({
      ARCHIVE_FILES: "/a/batch0001.csv, /a/batch0002.csv ,",
    });

    expect(options.files).toEqual([
      "/a/batch0001.csv",
      "/a/batch0002.csv",
    ]);
  });

  it("honours ARCHIVE_DIR, RESTORE_BATCH_SIZE and ALLOW_UNVERIFIED_ARCHIVE", () => {
    const options = parseRestoreCliOptions({
      ARCHIVE_DIR: "/var/archives",
      RESTORE_BATCH_SIZE: "250",
      ALLOW_UNVERIFIED_ARCHIVE: "yes",
    });

    expect(options.dir).toBe("/var/archives");
    expect(options.batchSize).toBe(250);
    expect(options.allowMissingChecksum).toBe(true);
  });

  it("requires the exact value yes to skip checksum verification", () => {
    expect(
      parseRestoreCliOptions({ ALLOW_UNVERIFIED_ARCHIVE: "true" })
        .allowMissingChecksum,
    ).toBe(false);
  });
});

describe("discoverArchiveFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-discover-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("finds CSVs in filename order, which is batch order", () => {
    for (const name of [
      "raffle_events_2026-01-15_batch0002.csv",
      "raffle_events_2026-01-15_batch0001.csv",
      "raffle_events_2026-01-15_batch0001.csv.sha256",
    ]) {
      fs.writeFileSync(path.join(tmpDir, name), "", "utf8");
    }

    expect(discoverArchiveFiles(tmpDir)).toEqual([
      path.join(tmpDir, "raffle_events_2026-01-15_batch0001.csv"),
      path.join(tmpDir, "raffle_events_2026-01-15_batch0002.csv"),
    ]);
  });

  it("prefers an explicit file list over the directory", () => {
    expect(discoverArchiveFiles(tmpDir, ["/explicit/batch0001.csv"])).toEqual([
      "/explicit/batch0001.csv",
    ]);
  });

  it("throws when the directory does not exist", () => {
    expect(() => discoverArchiveFiles(path.join(tmpDir, "nope"))).toThrow(
      /Archive directory not found/,
    );
  });

  it("throws when there is nothing to restore", () => {
    expect(() => discoverArchiveFiles(tmpDir)).toThrow(
      /No archive CSV files found/,
    );
  });
});
