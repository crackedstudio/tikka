import { ArchiveDeleteConfirmationError } from "./confirmation";
import { parseArchiveCliOptions, runArchiveCli } from "./cli";

describe("archive CLI options", () => {
  it("applies documented defaults for an empty environment", () => {
    expect(parseArchiveCliOptions({})).toEqual({
      retentionDays: 30,
      batchSize: 500,
      maxBatch: undefined,
      dryRun: true,
      resumeFromCheckpoint: true,
    });
  });

  it("reads every documented environment variable", () => {
    expect(
      parseArchiveCliOptions({
        RAFFLE_EVENTS_RETENTION_DAYS: "90",
        BATCH_SIZE: "2000",
        MAX_BATCH: "10",
        DRY_RUN: "false",
        RESUME: "false",
      }),
    ).toEqual({
      retentionDays: 90,
      batchSize: 2000,
      maxBatch: 10,
      dryRun: false,
      resumeFromCheckpoint: false,
    });
  });

  it.each(["true", "FALSE", "0", "no", ""])(
    "keeps the dry run when DRY_RUN=%p (only the exact string 'false' disables it)",
    (value) => {
      expect(parseArchiveCliOptions({ DRY_RUN: value }).dryRun).toBe(true);
    },
  );

  it.each(["true", "FALSE", "0", ""])(
    "keeps resume enabled when RESUME=%p",
    (value) => {
      expect(
        parseArchiveCliOptions({ RESUME: value }).resumeFromCheckpoint,
      ).toBe(true);
    },
  );

  it("leaves maxBatch unlimited when MAX_BATCH is unset or empty", () => {
    expect(parseArchiveCliOptions({}).maxBatch).toBeUndefined();
    expect(parseArchiveCliOptions({ MAX_BATCH: "" }).maxBatch).toBeUndefined();
  });
});

describe("runArchiveCli", () => {
  it("refuses a destructive run before opening a database connection", async () => {
    // stdin is not a TTY under jest, so the gate must reject outright rather
    // than prompt — and it must do so before AppDataSource is imported.
    await expect(runArchiveCli({ DRY_RUN: "false" })).rejects.toBeInstanceOf(
      ArchiveDeleteConfirmationError,
    );
  });
});
