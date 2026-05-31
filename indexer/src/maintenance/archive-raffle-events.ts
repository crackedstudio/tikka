import { AppDataSource } from "../data-source";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../database/entities/archive-checkpoint.entity";
import { DataSource, In, LessThan, MoreThan, Repository } from "typeorm";
import * as fs from "fs";
import * as path from "path";

export interface ArchiveOptions {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  outDir?: string;
  maxBatch?: number;
  resumeFromCheckpoint?: boolean;
}

export interface ArchiveResult {
  totalArchived: number;
  batchesProcessed: number;
  filesCreated: string[];
  checkpointId?: string;
  resumed: boolean;
  reachedMaxBatch: boolean;
}

export interface ArchiveProgress {
  batchNumber: number;
  totalArchived: number;
  currentBatchSize: number;
  timestamp: Date;
}

/**
 * Archive old raffle_events to local CSV and delete them safely in batches.
 * Supports resumable checkpointing, dry-run simulation, and max-batch limits.
 *
 * @param dataSource - TypeORM DataSource for transactional checkpoint updates
 * @param opts - Configuration options for archiving behavior
 * @returns Summary of archiving operation including counts and file paths
 */
export async function archiveOldRaffleEvents(
  dataSource: DataSource,
  opts: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const retentionDays = opts.retentionDays ?? 30;
  const batchSize = opts.batchSize ?? 500;
  const dryRun = opts.dryRun ?? true;
  const outDir = opts.outDir ?? path.join(process.cwd(), "archives");
  const maxBatch = opts.maxBatch;
  const resumeFromCheckpoint = opts.resumeFromCheckpoint ?? true;

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const jobType = "raffle_events";

  const eventRepo = dataSource.getRepository(RaffleEventEntity);
  const checkpointRepo = dataSource.getRepository(ArchiveCheckpointEntity);

  // Attempt to resume from existing checkpoint
  let checkpoint: ArchiveCheckpointEntity | null = null;
  let resumed = false;

  if (resumeFromCheckpoint && !dryRun) {
    checkpoint = await findOrCreateCheckpoint(
      checkpointRepo,
      jobType,
      cutoff,
      retentionDays,
      batchSize,
      maxBatch,
    );

    if (checkpoint.batchNumber > 0) {
      resumed = true;
      logProgress({
        message: `Resuming from checkpoint: batch ${checkpoint.batchNumber}, archived ${checkpoint.totalArchived} records`,
        batchNumber: checkpoint.batchNumber,
        totalArchived: checkpoint.totalArchived,
        checkpointId: checkpoint.id,
      });
    }
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
    const rows = await queryNextBatch(
      eventRepo,
      cutoff,
      batchSize,
      checkpoint?.lastProcessedTimestamp ?? null,
      checkpoint?.lastProcessedId ?? null,
    );

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

    // Write to CSV
    const filename = await writeBatchToCsv(
      rows,
      outDir,
      cutoff,
      batchNumber,
      dryRun,
    );
    filesCreated.push(filename);

    totalArchived += rows.length;

    // Delete records and update checkpoint in a transaction
    if (!dryRun) {
      await dataSource.transaction(async (manager) => {
        const ids = rows.map((r) => r.id);
        await manager.delete(RaffleEventEntity, { id: In(ids) } as any);

        // Update checkpoint
        if (checkpoint) {
          checkpoint.batchNumber = batchNumber;
          checkpoint.totalArchived = totalArchived;
          checkpoint.lastProcessedTimestamp = rows[rows.length - 1].indexedAt;
          checkpoint.lastProcessedId = rows[rows.length - 1].id;
          checkpoint.updatedAt = new Date();
          await manager.save(checkpoint);
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
    checkpoint.status = ArchiveJobStatus.COMPLETED;
    checkpoint.completedAt = new Date();
    await checkpointRepo.save(checkpoint);

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

// CLI entrypoint
if (require.main === module) {
  (async () => {
    const retentionDays = parseInt(process.env.RAFFLE_EVENTS_RETENTION_DAYS ?? "30", 10);
    const dryRun = process.env.DRY_RUN !== "false"; // default true

    await AppDataSource.initialize();

    console.log(`Starting archival: retentionDays=${retentionDays}, dryRun=${dryRun}`);
    const result = await archiveOldRaffleEvents(AppDataSource, {
      retentionDays,
      dryRun,
      batchSize: 500,
    });
    console.log(`Archived approx ${result.totalArchived} rows (dryRun=${dryRun})`);
    await AppDataSource.destroy();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Find existing checkpoint or create a new one for the archiving job.
 * Ensures only one active checkpoint exists per job type.
 */
async function findOrCreateCheckpoint(
  checkpointRepo: Repository<ArchiveCheckpointEntity>,
  jobType: string,
  cutoff: Date,
  retentionDays: number,
  batchSize: number,
  maxBatch?: number,
): Promise<ArchiveCheckpointEntity> {
  // Look for existing in-progress checkpoint
  let checkpoint = await checkpointRepo.findOne({
    where: {
      jobType,
      status: ArchiveJobStatus.IN_PROGRESS,
    },
    order: { startedAt: "DESC" },
  });

  if (checkpoint) {
    // Validate checkpoint is for the same cutoff date
    const checkpointCutoff = new Date(checkpoint.configSnapshot.cutoffDate);
    if (checkpointCutoff.getTime() === cutoff.getTime()) {
      return checkpoint;
    }

    // Different cutoff, mark old checkpoint as completed and create new one
    checkpoint.status = ArchiveJobStatus.COMPLETED;
    checkpoint.completedAt = new Date();
    await checkpointRepo.save(checkpoint);
  }

  // Create new checkpoint
  checkpoint = checkpointRepo.create({
    jobType,
    status: ArchiveJobStatus.IN_PROGRESS,
    totalArchived: 0,
    batchNumber: 0,
    lastProcessedTimestamp: null,
    lastProcessedId: null,
    configSnapshot: {
      retentionDays,
      batchSize,
      maxBatch,
      cutoffDate: cutoff.toISOString(),
    },
  });

  return await checkpointRepo.save(checkpoint);
}

/**
 * Query the next batch of events to archive, resuming from checkpoint if available.
 */
async function queryNextBatch(
  eventRepo: Repository<RaffleEventEntity>,
  cutoff: Date,
  batchSize: number,
  lastProcessedTimestamp: Date | null,
  lastProcessedId: string | null,
): Promise<RaffleEventEntity[]> {
  const queryBuilder = eventRepo
    .createQueryBuilder("event")
    .where("event.indexedAt < :cutoff", { cutoff })
    .orderBy("event.indexedAt", "ASC")
    .addOrderBy("event.id", "ASC")
    .take(batchSize);

  // Resume from checkpoint if available
  if (lastProcessedTimestamp && lastProcessedId) {
    queryBuilder.andWhere(
      "(event.indexedAt > :lastTimestamp OR (event.indexedAt = :lastTimestamp AND event.id > :lastId))",
      {
        lastTimestamp: lastProcessedTimestamp,
        lastId: lastProcessedId,
      },
    );
  }

  return await queryBuilder.getMany();
}

/**
 * Write a batch of events to CSV file.
 */
async function writeBatchToCsv(
  rows: RaffleEventEntity[],
  outDir: string,
  cutoff: Date,
  batchNumber: number,
  dryRun: boolean,
): Promise<string> {
  const filename = path.join(
    outDir,
    `raffle_events_${cutoff.toISOString().slice(0, 10)}_batch${String(batchNumber).padStart(4, "0")}.csv`,
  );

  const prefix = dryRun ? "[DRY-RUN] " : "";
  logProgress({
    message: `${prefix}Writing ${rows.length} records to ${filename}`,
    batchNumber,
    totalArchived: 0,
  });

  const header = [
    "id",
    "raffle_id",
    "event_type",
    "schema_version",
    "ledger",
    "tx_hash",
    "payload_json",
    "indexed_at",
  ];

  const stream = fs.createWriteStream(filename, { encoding: "utf8" });
  stream.write(header.join(",") + "\n");

  for (const row of rows) {
    const line = [
      row.id,
      String(row.raffleId),
      row.eventType,
      String(row.schemaVersion ?? 1),
      String(row.ledger),
      row.txHash,
      JSON.stringify(row.payloadJson).replace(/\n/g, " ").replace(/\r/g, " "),
      row.indexedAt.toISOString(),
    ]
      .map((v) => {
        if (typeof v === "string" && v.includes(",")) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      })
      .join(",");
    stream.write(line + "\n");
  }

  stream.end();
  await new Promise<void>((resolve) => stream.on("finish", () => resolve()));

  return filename;
}

/**
 * Log progress with structured information for monitoring and debugging.
 */
function logProgress(progress: {
  message: string;
  batchNumber: number;
  totalArchived: number;
  currentBatchSize?: number;
  checkpointId?: string;
  timestamp?: Date;
}): void {
  const timestamp = progress.timestamp ?? new Date();
  const logEntry = {
    timestamp: timestamp.toISOString(),
    message: progress.message,
    batchNumber: progress.batchNumber,
    totalArchived: progress.totalArchived,
    currentBatchSize: progress.currentBatchSize,
    checkpointId: progress.checkpointId,
  };

  console.log(JSON.stringify(logEntry));
}

// CLI entrypoint
if (require.main === module) {
  (async () => {
    const retentionDays = parseInt(
      process.env.RAFFLE_EVENTS_RETENTION_DAYS ?? "30",
      10,
    );
    const batchSize = parseInt(process.env.BATCH_SIZE ?? "500", 10);
    const maxBatch = process.env.MAX_BATCH
      ? parseInt(process.env.MAX_BATCH, 10)
      : undefined;
    const dryRun = process.env.DRY_RUN !== "false"; // default true
    const resumeFromCheckpoint = process.env.RESUME !== "false"; // default true

    await AppDataSource.initialize();

    console.log(
      JSON.stringify({
        message: "Starting raffle events archival",
        config: {
          retentionDays,
          batchSize,
          maxBatch: maxBatch ?? "unlimited",
          dryRun,
          resumeFromCheckpoint,
        },
      }),
    );

    const result = await archiveOldRaffleEvents(AppDataSource, {
      retentionDays,
      dryRun,
      batchSize,
      maxBatch,
      resumeFromCheckpoint,
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
    process.exit(0);
  })().catch((err) => {
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
