import * as fs from "fs";
import * as path from "path";
import {
  RESTORE_DEFAULTS,
  RestoreResult,
  restoreRaffleEventsArchive,
} from "./restore";
import { defaultArchiveDir } from "./writer";

/**
 * CLI wiring for `npm run restore:raffle-events`.
 *
 * Restoring is additive and idempotent (`ON CONFLICT DO NOTHING`), so it needs
 * no confirmation prompt — but it *does* write rows, so `DRY_RUN` defaults to
 * true and only the exact string `"false"` turns it off. The env-var names and
 * the two JSON summary lines are the operator contract documented in
 * `docs/runbooks/restore-raffle-events.md`.
 */

export interface RestoreCliOptions {
  /** Directory scanned for `*.csv` archives. */
  dir: string;
  /** Explicit file list; when present, `dir` is not scanned. */
  files?: string[];
  dryRun: boolean;
  batchSize: number;
  allowMissingChecksum: boolean;
}

/**
 * Translate environment variables into restore options.
 *
 * `ARCHIVE_FILES` (comma-separated) restores exactly the named files — the
 * under-pressure path when one batch has to come back. Otherwise every `*.csv`
 * in `ARCHIVE_DIR` is restored in filename order, which matches the order the
 * batches were written.
 */
export function parseRestoreCliOptions(
  env: NodeJS.ProcessEnv = process.env,
): RestoreCliOptions {
  const explicitFiles = (env.ARCHIVE_FILES ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter((file) => file.length > 0);

  return {
    dir: env.ARCHIVE_DIR ?? defaultArchiveDir(),
    files: explicitFiles.length > 0 ? explicitFiles : undefined,
    dryRun: env.DRY_RUN !== "false", // default true
    batchSize: parseInt(
      env.RESTORE_BATCH_SIZE ?? String(RESTORE_DEFAULTS.batchSize),
      10,
    ),
    // Only the exact string "yes" opts out of checksum verification.
    allowMissingChecksum: env.ALLOW_UNVERIFIED_ARCHIVE === "yes",
  };
}

/**
 * Resolve the files to restore: the explicit list when given, otherwise every
 * `.csv` in `dir` sorted by name. Throws when there is nothing to restore so an
 * empty run is an error rather than a silent no-op.
 */
export function discoverArchiveFiles(
  dir: string,
  files?: string[],
): string[] {
  if (files && files.length > 0) {
    return files;
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`Archive directory not found: ${dir}`);
  }

  const discovered = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".csv"))
    .sort()
    .map((file) => path.join(dir, file));

  if (discovered.length === 0) {
    throw new Error(
      `No archive CSV files found in ${dir}. Set ARCHIVE_DIR or ARCHIVE_FILES.`,
    );
  }

  return discovered;
}

/**
 * Run one restore pass: discover, verify, import, report, disconnect.
 * Throws on failure so the caller decides the exit code.
 */
export async function runRestoreCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const options = parseRestoreCliOptions(env);
  const files = discoverArchiveFiles(options.dir, options.files);

  // Lazy-load so unit tests importing this module do not pull AppDataSource.
  const { AppDataSource } = await import("../../data-source");
  await AppDataSource.initialize();

  console.log(
    JSON.stringify({
      message: "Starting raffle events restore",
      config: {
        dir: options.files ? undefined : options.dir,
        files: options.files ?? files.length,
        dryRun: options.dryRun,
        batchSize: options.batchSize,
        allowMissingChecksum: options.allowMissingChecksum,
      },
    }),
  );

  const result: RestoreResult = await restoreRaffleEventsArchive(
    AppDataSource,
    files,
    {
      dryRun: options.dryRun,
      batchSize: options.batchSize,
      allowMissingChecksum: options.allowMissingChecksum,
    },
  );

  console.log(
    JSON.stringify({
      message: "Restore completed",
      result: {
        dryRun: result.dryRun,
        filesProcessed: result.filesProcessed,
        rowsRead: result.rowsRead,
        rowsInserted: result.rowsInserted,
        rowsAlreadyPresent: result.rowsAlreadyPresent,
        wouldInsert: result.rowsRead - result.rowsAlreadyPresent,
      },
    }),
  );

  await AppDataSource.destroy();
}

/**
 * Process-level wrapper: exit 0 on success, 1 with a structured error on
 * failure. Invoked only when the entry point is executed directly.
 */
export function executeRestoreCli(): void {
  runRestoreCli()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(
        JSON.stringify({
          message: "Restore failed",
          error: err.message,
          stack: err.stack,
        }),
      );
      process.exit(1);
    });
}
