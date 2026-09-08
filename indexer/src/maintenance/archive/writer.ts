import * as fs from "fs";
import * as path from "path";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { logProgress } from "./logging";

/**
 * CSV archive writer.
 *
 * The on-disk format is an operator contract: archives are restored with
 * `\copy` into a staging table (see `docs/database/raffle-events-retention.md`),
 * so the header, the column order, and the escaping rules must stay stable.
 */

export const ARCHIVE_CSV_HEADER = [
  "id",
  "raffle_id",
  "event_type",
  "schema_version",
  "ledger",
  "tx_hash",
  "payload_json",
  "indexed_at",
];

export interface WriteBatchOptions {
  outDir: string;
  cutoff: Date;
  batchNumber: number;
  /** Dry runs still write CSVs so operators can validate output. */
  dryRun: boolean;
}

/** Default archive destination when the caller does not supply one. */
export function defaultArchiveDir(): string {
  return path.join(process.cwd(), "archives");
}

/** Create the archive directory if it does not exist yet. */
export function ensureArchiveDir(outDir: string): void {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
}

/**
 * `<outDir>/raffle_events_<cutoff-date>_batch0001.csv` — sortable and stable so
 * repeated runs against the same cutoff produce predictable names.
 */
export function archiveFilePath(
  outDir: string,
  cutoff: Date,
  batchNumber: number,
): string {
  return path.join(
    outDir,
    `raffle_events_${cutoff.toISOString().slice(0, 10)}_batch${String(batchNumber).padStart(4, "0")}.csv`,
  );
}

/** Serialize one event row, quoting only the fields that contain a comma. */
export function toCsvLine(row: RaffleEventEntity): string {
  return [
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
}

/**
 * Write a batch of events to a CSV file and resolve with its path.
 */
export async function writeBatchToCsv(
  rows: RaffleEventEntity[],
  options: WriteBatchOptions,
): Promise<string> {
  const filename = archiveFilePath(
    options.outDir,
    options.cutoff,
    options.batchNumber,
  );

  const prefix = options.dryRun ? "[DRY-RUN] " : "";
  logProgress({
    message: `${prefix}Writing ${rows.length} records to ${filename}`,
    batchNumber: options.batchNumber,
    totalArchived: 0,
  });

  const stream = fs.createWriteStream(filename, { encoding: "utf8" });
  stream.write(ARCHIVE_CSV_HEADER.join(",") + "\n");

  for (const row of rows) {
    stream.write(toCsvLine(row) + "\n");
  }

  stream.end();
  await new Promise<void>((resolve) => stream.on("finish", () => resolve()));

  return filename;
}
