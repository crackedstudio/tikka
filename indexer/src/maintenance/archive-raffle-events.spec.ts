// @ts-nocheck
import * as entryPoint from "./archive-raffle-events";

/**
 * The `archive:raffle-events` script path and the module's public surface are a
 * production contract (see `docs/runbooks/archive-raffle-events.md`). The
 * implementation lives in `./archive/*`; this guards the re-exports so the
 * split cannot silently break callers or the npm script.
 *
 * Behavioural coverage lives beside each unit in `src/maintenance/archive/`.
 */
describe("archive-raffle-events entry point", () => {
  it.each([
    "archiveOldRaffleEvents",
    "computeIntegrityHash",
    "verifyCheckpointIntegrity",
    "recordIntegrityFailure",
    "raiseIntegrityAlert",
    "ArchiveCheckpointService",
    "ArchiveCheckpointIntegrityError",
    "ArchiveDeleteConfirmationError",
    "isDeleteConfirmed",
    "requireDeleteConfirmation",
    "promptDeleteConfirmation",
    "selectNextBatch",
    "deleteArchivedRows",
    "writeBatchToCsv",
    "parseArchiveCliOptions",
    "runArchiveCli",
    "executeArchiveCli",
  ])("re-exports %s", (name) => {
    expect(entryPoint[name as keyof typeof entryPoint]).toBeDefined();
  });

  it("re-exports the archival constants operators depend on", () => {
    expect(entryPoint.CONFIRM_DELETE_ENV).toBe("CONFIRM_DELETE");
    expect(entryPoint.CONFIRM_DELETE_VALUE).toBe("yes");
    expect(entryPoint.ARCHIVE_JOB_TYPE).toBe("raffle_events");
    expect(entryPoint.ARCHIVE_CHECKPOINT_INTEGRITY_VERSION).toBe(1);
    expect(entryPoint.ARCHIVE_DEFAULTS).toEqual({
      retentionDays: 30,
      batchSize: 500,
      dryRun: true,
      resumeFromCheckpoint: true,
    });
  });

  it("does not run the CLI when imported as a module", () => {
    // require.main is jest's runner here, so importing must have no side effect.
    expect(require.main).not.toBe(module);
  });
});

