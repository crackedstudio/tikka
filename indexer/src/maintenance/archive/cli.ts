import { isDeleteConfirmed, requireDeleteConfirmation } from "./confirmation";
import { archiveOldRaffleEvents } from "./runner";
import { ARCHIVE_DEFAULTS } from "./types";

/**
 * CLI wiring for `npm run archive:raffle-events`.
 *
 * The env-var names, the two JSON summary lines, and the exit codes are the
 * operator contract documented in `docs/runbooks/archive-raffle-events.md`;
 * changing them breaks production cron jobs.
 */

export interface ArchiveCliOptions {
  retentionDays: number;
  batchSize: number;
  maxBatch?: number;
  dryRun: boolean;
  resumeFromCheckpoint: boolean;
}

/**
 * Translate environment variables into archive options.
 *
 * `DRY_RUN` and `RESUME` default to true and only `"false"` turns them off, so a
 * typo can never silently escalate a dry run into a destructive one.
 */
export function parseArchiveCliOptions(
  env: NodeJS.ProcessEnv = process.env,
): ArchiveCliOptions {
  return {
    retentionDays: parseInt(
      env.RAFFLE_EVENTS_RETENTION_DAYS ??
        String(ARCHIVE_DEFAULTS.retentionDays),
      10,
    ),
    batchSize: parseInt(
      env.BATCH_SIZE ?? String(ARCHIVE_DEFAULTS.batchSize),
      10,
    ),
    maxBatch: env.MAX_BATCH ? parseInt(env.MAX_BATCH, 10) : undefined,
    dryRun: env.DRY_RUN !== "false", // default true
    resumeFromCheckpoint: env.RESUME !== "false", // default true
  };
}

/**
 * Run one archival pass: confirm, connect, archive, report, disconnect.
 * Throws on failure so the caller decides the exit code.
 */
export async function runArchiveCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const options = parseArchiveCliOptions(env);

  // Refuse destructive runs unless the operator confirms (TTY prompt or
  // CONFIRM_DELETE=yes). See docs/database/raffle-events-retention.md.
  await requireDeleteConfirmation({ dryRun: options.dryRun, env });

  // Lazy-load so unit tests importing this module do not pull AppDataSource.
  const { AppDataSource } = await import("../../data-source");
  await AppDataSource.initialize();

  console.log(
    JSON.stringify({
      message: "Starting raffle events archival",
      config: {
        retentionDays: options.retentionDays,
        batchSize: options.batchSize,
        maxBatch: options.maxBatch ?? "unlimited",
        dryRun: options.dryRun,
        resumeFromCheckpoint: options.resumeFromCheckpoint,
        confirmDelete: isDeleteConfirmed(env),
      },
    }),
  );

  const result = await archiveOldRaffleEvents(AppDataSource, {
    retentionDays: options.retentionDays,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    maxBatch: options.maxBatch,
    resumeFromCheckpoint: options.resumeFromCheckpoint,
  });

  console.log(
    JSON.stringify({
      message: "Archival completed",
      result: {
        totalArchived: result.totalArchived,
        batchesProcessed: result.batchesProcessed,
        filesCreated: result.filesCreated.length,
        checkpointId: result.checkpointId,
        resumed: result.resumed,
        reachedMaxBatch: result.reachedMaxBatch,
      },
    }),
  );

  await AppDataSource.destroy();
}

/**
 * Process-level wrapper: exit 0 on success, 1 with a structured error on
 * failure. Invoked only when the entry point is executed directly.
 */
export function executeArchiveCli(): void {
  runArchiveCli()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        JSON.stringify({
          message: "Archival failed",
          error: err.message,
          stack: err.stack,
        }),
      );
      process.exit(1);
    });
}
