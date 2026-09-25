import { DataSource } from "typeorm";
import { ArchiveCheckpointEntity } from "../../database/entities/archive-checkpoint.entity";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { deleteArchivedRows, selectNextBatch } from "./batch-selector";
import { ArchiveCheckpointService } from "./checkpoint.service";
import { logProgress } from "./logging";
import {
  ARCHIVE_DEFAULTS,
  ARCHIVE_JOB_TYPE,
  ArchiveOptions,
  ArchiveResult,
} from "./types";
import { defaultArchiveDir, ensureArchiveDir, writeBatchToCsv } from "./writer";

/**
 * Archive old raffle_events to local CSV and delete them safely in batches.
 * Supports resumable checkpointing, dry-run simulation, and max-batch limits.
 *
 * Orchestration only: selection lives in `batch-selector`, CSV output in
 * `writer`, and checkpoint state in `checkpoint.service`.
 *
 * @param dataSource - TypeORM DataSource for transactional checkpoint updates
 * @param opts - Configuration options for archiving behavior
 * @returns Summary of archiving operation including counts and file paths
 */
export async function archiveOldRaffleEvents(
  dataSource: DataSource,
  opts: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const retentionDays = opts.retentionDays ?? ARCHIVE_DEFAULTS.retentionDays;
  const batchSize = opts.batchSize ?? ARCHIVE_DEFAULTS.batchSize;
  const dryRun = opts.dryRun ?? ARCHIVE_DEFAULTS.dryRun;
  const outDir = opts.outDir ?? defaultArchiveDir();
  const maxBatch = opts.maxBatch;
  const resumeFromCheckpoint =
    opts.resumeFromCheckpoint ?? ARCHIVE_DEFAULTS.resumeFromCheckpoint;

  ensureArchiveDir(outDir);

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const eventRepo = dataSource.getRepository(RaffleEventEntity);
  const checkpoints = new ArchiveCheckpointService(
    dataSource.getRepository(ArchiveCheckpointEntity),
  );

  // Attempt to resume from existing checkpoint. Checkpointing is pointless for
  // a dry run, which writes no state.
  let checkpoint: ArchiveCheckpointEntity | null = null;
  let resumed = false;

  if (resumeFromCheckpoint && !dryRun) {
    // Throws ArchiveCheckpointIntegrityError (after marking the checkpoint
    // FAILED) when a resumed hash no longer matches the row state, so the loop
    // below never runs against corrupted state.
    ({ checkpoint, resumed } = await checkpoints.begin({
      jobType: ARCHIVE_JOB_TYPE,
      cutoff,
      retentionDays,
      batchSize,
      maxBatch,
    }));
  }

  let batchNumber = checkpoint?.batchNumber ?? 0;
  let totalArchived = checkpoint?.totalArchived ?? 0;
  const filesCreated: string[] = [];
  let reachedMaxBatch = false;

  logProgress({
    message: `Starting archival: retentionDays=${retentionDays}, batchSize=${batchSize}, dryRun=${dryRun}, maxBatch=${maxBatch ?? "unlimited"}`,
    batchNumber: 0,
    totalArchived: 0,
  });

  while (true) {
    // Check max batch limit
    if (maxBatch !== undefined && batchNumber >= maxBatch) {
      reachedMaxBatch = true;
      logProgress({
        message: `Reached max batch limit of ${maxBatch}, stopping`,
        batchNumber,
        totalArchived,
      });
      break;
    }

    // Query next batch of old events
    const rows = await selectNextBatch(eventRepo, {
      cutoff,
      batchSize,
      lastProcessedTimestamp: checkpoint?.lastProcessedTimestamp ?? null,
      lastProcessedId: checkpoint?.lastProcessedId ?? null,
    });

    if (rows.length === 0) {
      logProgress({
        message: "No more records to archive",
        batchNumber,
        totalArchived,
      });
      break;
    }

    batchNumber += 1;

    logProgress({
      message: `Processing batch ${batchNumber}: ${rows.length} records`,
      batchNumber,
      totalArchived,
      currentBatchSize: rows.length,
    });

    // Write to CSV before touching the database so a crash mid-batch leaves the
    // rows intact (a re-run simply overwrites the CSV).
    filesCreated.push(
      await writeBatchToCsv(rows, { outDir, cutoff, batchNumber, dryRun }),
    );

    totalArchived += rows.length;

    // Delete records and update checkpoint in a transaction
    if (!dryRun) {
      const lastRow = rows[rows.length - 1];
      await dataSource.transaction(async (manager) => {
        await deleteArchivedRows(manager, rows);

        if (checkpoint) {
          await checkpoints.saveBatchProgress(manager, checkpoint, {
            batchNumber,
            totalArchived,
            lastProcessedTimestamp: lastRow.indexedAt,
            lastProcessedId: lastRow.id,
          });
        }
      });

      logProgress({
        message: `Batch ${batchNumber} completed: archived ${rows.length} records, deleted from database`,
        batchNumber,
        totalArchived,
      });
    } else {
      logProgress({
        message: `[DRY-RUN] Batch ${batchNumber} completed: would archive ${rows.length} records (no deletion)`,
        batchNumber,
        totalArchived,
      });
    }

    // If fewer than batchSize rows were returned, we're done
    if (rows.length < batchSize) {
      logProgress({
        message: `Batch returned fewer than ${batchSize} records, archiving complete`,
        batchNumber,
        totalArchived,
      });
      break;
    }
  }

  // Mark checkpoint as completed
  if (checkpoint && !dryRun && !reachedMaxBatch) {
    await checkpoints.markCompleted(checkpoint);

    logProgress({
      message: `Checkpoint marked as completed`,
      batchNumber,
      totalArchived,
      checkpointId: checkpoint.id,
    });
  }

  const result: ArchiveResult = {
    totalArchived,
    batchesProcessed: batchNumber,
    filesCreated,
    checkpointId: checkpoint?.id,
    resumed,
    reachedMaxBatch,
  };

  logProgress({
    message: `Archival complete: ${totalArchived} records in ${batchNumber} batches, ${filesCreated.length} files created`,
    batchNumber,
    totalArchived,
  });

  return result;
}
