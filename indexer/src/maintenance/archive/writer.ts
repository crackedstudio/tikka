import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
// Type-only: the writer never instantiates an entity, so writing a CSV must not
// pull TypeORM (or the entity decorators) into the process.
import type { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { archiveChecksumPath, serializeArchiveChecksum } from "./checksum";
import { logProgress } from "./logging";

/**
 * CSV archive writer.
 *
 * The on-disk format is an operator contract: archives are restored with
 * `npm run restore:raffle-events` (see `docs/runbooks/restore-raffle-events.md`),
 * so the header, the column order, and the escaping rules must stay stable.
 *
 * Every file is written together with a `<file>.sha256` sidecar of the exact
 * bytes written, so a restore can prove the file it is about to import is the
 * file the archiver produced.
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
  "contract_address",
];

/**
 * Header written by archivers that predate the `contract_address` column.
 * `restore` accepts both: an archive must stay importable across an upgrade,
 * and this is the shape every existing archive on disk has.
 */
export const LEGACY_ARCHIVE_CSV_HEADER = [
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
    row.contractAddress ?? "",
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
 * Write a batch of events to a CSV file plus its checksum sidecar, and resolve
 * with the CSV path.
 *
 * The digest is computed from the lines as they are written rather than by
 * re-reading the file, so the sidecar always describes exactly what was
 * flushed and the writer keeps its single sequential write.
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

  const hash = crypto.createHash("sha256");
  const stream = fs.createWriteStream(filename, { encoding: "utf8" });

  const headerLine = ARCHIVE_CSV_HEADER.join(",") + "\n";
  hash.update(headerLine);
  stream.write(headerLine);

  for (const row of rows) {
    const line = toCsvLine(row) + "\n";
    hash.update(line);
    stream.write(line);
  }

  stream.end();
  await new Promise<void>((resolve) => stream.on("finish", () => resolve()));

  const digest = hash.digest("hex");
  fs.writeFileSync(
    archiveChecksumPath(filename),
    serializeArchiveChecksum(digest, filename),
    "utf8",
  );

  return filename;
}
