import * as fs from "fs";
import type { DataSource, EntityManager } from "typeorm";
import {
  ArchiveChecksumStatus,
  assertArchiveChecksum,
} from "./checksum";
import { logRestoreProgress } from "./logging";
import {
  ARCHIVE_CSV_HEADER,
  LEGACY_ARCHIVE_CSV_HEADER,
} from "./writer";

/**
 * Restore archived `raffle_events` rows from their CSV archives.
 *
 * The archiver deletes rows, so a restore path that is only "documented SQL" is
 * a restore path that has never been executed. This module is the executable
 * half of that contract:
 *
 *  1. verify the file's SHA-256 against the sidecar the writer produced
 *     (`checksum.ts`) — a tampered or truncated archive is rejected wholesale;
 *  2. parse the CSV strictly (header, column count, UUID, integers, JSON,
 *     timestamps) so a corrupt file fails before touching the database;
 *  3. insert each file inside one transaction with `ON CONFLICT DO NOTHING`,
 *     making the restore idempotent and re-runnable under pressure.
 *
 * Format history: archives written before `contract_address` was added to the
 * header are still accepted (the column is restored as NULL). Anything else —
 * a missing column, a reordered header, an extra field — is a hard error rather
 * than a guess.
 *
 * See `docs/runbooks/restore-raffle-events.md` for the operator procedure and
 * `restore.spec.ts` / `archive-restore.integration.spec.ts` for the round trip.
 */

/** Table restored into. */
export const RAFFLE_EVENTS_TABLE = "raffle_events";

/**
 * Columns written by `INSERT`. `id` and `indexed_at` are restored verbatim (an
 * archive is a copy, not a re-ingest), which is why they are listed explicitly
 * rather than left to the column defaults.
 */
export const RESTORE_INSERT_COLUMNS = [
  "id",
  "raffle_id",
  "event_type",
  "schema_version",
  "ledger",
  "tx_hash",
  "payload_json",
  "indexed_at",
  "contract_address",
] as const;

export const RESTORE_DEFAULTS = {
  /** Restoring writes rows, so the default is the safe one: prove, don't write. */
  dryRun: true,
  batchSize: 500,
  /**
   * Archives without a checksum sidecar are refused by default; set true only
   * for archives produced before checksums existed, with the gap documented.
   */
  allowMissingChecksum: false,
} as const;

export interface RestoreOptions {
  dryRun?: boolean;
  /** Rows per INSERT statement. */
  batchSize?: number;
  allowMissingChecksum?: boolean;
}

/** One row of an archive, parsed and validated. */
export interface ArchivedRaffleEvent {
  id: string;
  raffleId: number;
  eventType: string;
  contractAddress: string | null;
  schemaVersion: number;
  ledger: number;
  txHash: string;
  payloadJson: Record<string, unknown>;
  indexedAt: Date;
}

export interface ParsedArchive {
  filePath: string;
  header: string[];
  /** True when the file predates the `contract_address` column. */
  legacyHeader: boolean;
  /**
   * How the file's integrity was established. `null` means the content was
   * parsed directly (`parseArchiveCsv`), with no file to hash and compare.
   */
  checksumStatus: ArchiveChecksumStatus | null;
  rows: ArchivedRaffleEvent[];
}

export interface RestoreFileResult {
  filePath: string;
  checksumStatus: ArchiveChecksumStatus | null;
  rowsRead: number;
  /** Rows written by this run; always 0 for a dry run. */
  rowsInserted: number;
  /** Rows already present (dry run: already present, so not re-inserted). */
  rowsAlreadyPresent: number;
}

export interface RestoreResult {
  dryRun: boolean;
  filesProcessed: number;
  rowsRead: number;
  rowsInserted: number;
  rowsAlreadyPresent: number;
  files: RestoreFileResult[];
}

/** Raised when a file is not a well-formed raffle-events archive. */
export class ArchiveFormatError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line: number | null = null,
  ) {
    // The line number is part of the message so an operator can jump straight
    // to the offending row in a 500-row file without a debugger.
    super(line === null ? message : `${message} (line ${line})`);
    this.name = "ArchiveFormatError";
  }
}

interface CsvRecord {
  line: number;
  fields: string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * Split CSV content into records, honouring quoted fields (doubled quotes for
 * a literal quote, commas and newlines inside quotes). The writer replaces
 * embedded newlines in `payload_json`, but the parser handles them anyway so a
 * hand-edited or third-party archive cannot silently mis-align columns.
 */
function splitCsvRecords(content: string, filePath: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let index = 0;

  const endField = (): void => {
    fields.push(field);
    field = "";
  };

  const endRecord = (): void => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  while (index < content.length) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\n") {
        line += 1;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      // A quote only opens a quoted field at the start of that field. The
      // writer quotes a field only when its value contains a comma, so a raw
      // JSON payload such as {"price":10} carries literal quotes mid-field and
      // must not be mistaken for delimiters.
      if (field.length === 0) {
        inQuotes = true;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === ",") {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\n") {
      line += 1;
      endRecord();
      recordLine = line;
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (inQuotes) {
    throw new ArchiveFormatError(
      `Unterminated quoted field starting on line ${recordLine}`,
      filePath,
      recordLine,
    );
  }

  // A file that does not end with a newline still has a final record.
  if (field.length > 0 || fields.length > 0) {
    endRecord();
  }

  return records;
}

function sameColumns(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((column, i) => actual[i] === column)
  );
}

function normalizeHeader(
  header: string[],
  filePath: string,
  line: number,
): { header: string[]; legacyHeader: boolean } {
  const normalized = header.map((column) => column.trim().toLowerCase());

  if (sameColumns(normalized, ARCHIVE_CSV_HEADER)) {
    return { header: normalized, legacyHeader: false };
  }
  if (sameColumns(normalized, LEGACY_ARCHIVE_CSV_HEADER)) {
    return { header: normalized, legacyHeader: true };
  }

  throw new ArchiveFormatError(
    `Unexpected archive header on line ${line}. Expected ` +
      `"${ARCHIVE_CSV_HEADER.join(",")}" or the legacy ` +
      `"${LEGACY_ARCHIVE_CSV_HEADER.join(",")}", found "${header.join(",")}".`,
    filePath,
    line,
  );
}

function requireInteger(
  raw: string,
  column: string,
  filePath: string,
  line: number,
): number {
  if (!INTEGER_PATTERN.test(raw)) {
    throw new ArchiveFormatError(
      `Column "${column}" must be an integer, found "${raw}"`,
      filePath,
      line,
    );
  }
  return parseInt(raw, 10);
}

function requireNonEmpty(
  raw: string,
  column: string,
  filePath: string,
  line: number,
): string {
  if (raw.length === 0) {
    throw new ArchiveFormatError(
      `Column "${column}" must not be empty`,
      filePath,
      line,
    );
  }
  return raw;
}

function requireTimestamp(
  raw: string,
  column: string,
  filePath: string,
  line: number,
): Date {
  const parsed = new Date(raw);
  if (raw.length === 0 || Number.isNaN(parsed.getTime())) {
    throw new ArchiveFormatError(
      `Column "${column}" must be an ISO-8601 timestamp, found "${raw}"`,
      filePath,
      line,
    );
  }
  return parsed;
}

function requirePayload(
  raw: string,
  filePath: string,
  line: number,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ArchiveFormatError(
      `Column "payload_json" is not valid JSON on line ${line}`,
      filePath,
      line,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ArchiveFormatError(
      `Column "payload_json" must be a JSON object on line ${line}`,
      filePath,
      line,
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Parse an archive CSV. Throws `ArchiveFormatError` on the first problem, with
 * the offending line number; never returns partially-validated rows.
 */
export function parseArchiveCsv(
  content: string,
  filePath = "<inline>",
): ParsedArchive {
  const records = splitCsvRecords(content, filePath);

  if (records.length === 0) {
    throw new ArchiveFormatError("Archive file is empty", filePath, null);
  }

  const [headerRecord, ...rowRecords] = records;
  const { header, legacyHeader } = normalizeHeader(
    headerRecord.fields,
    filePath,
    headerRecord.line,
  );

  const columnIndex = new Map<string, number>();
  header.forEach((column, i) => columnIndex.set(column, i));

  const read = (fields: string[], column: string): string => {
    const i = columnIndex.get(column);
    return i === undefined ? "" : (fields[i] ?? "");
  };

  const rows: ArchivedRaffleEvent[] = rowRecords.map((record) => {
    const { fields, line } = record;

    if (fields.length !== header.length) {
      throw new ArchiveFormatError(
        `Expected ${header.length} columns, found ${fields.length}`,
        filePath,
        line,
      );
    }

    const id = requireNonEmpty(read(fields, "id"), "id", filePath, line);
    if (!UUID_PATTERN.test(id)) {
      throw new ArchiveFormatError(
        `Column "id" must be a UUID, found "${id}"`,
        filePath,
        line,
      );
    }

    const schemaVersionRaw = read(fields, "schema_version");

    return {
      id,
      raffleId: requireInteger(
        read(fields, "raffle_id"),
        "raffle_id",
        filePath,
        line,
      ),
      eventType: requireNonEmpty(
        read(fields, "event_type"),
        "event_type",
        filePath,
        line,
      ),
      // Absent in legacy archives; an archiver that never recorded it restored
      // the row with a NULL contract address, which is what we reproduce.
      contractAddress:
        read(fields, "contract_address").length > 0
          ? read(fields, "contract_address")
          : null,
      schemaVersion:
        schemaVersionRaw.length > 0
          ? requireInteger(schemaVersionRaw, "schema_version", filePath, line)
          : 1,
      ledger: requireInteger(
        read(fields, "ledger"),
        "ledger",
        filePath,
        line,
      ),
      txHash: requireNonEmpty(
        read(fields, "tx_hash"),
        "tx_hash",
        filePath,
        line,
      ),
      payloadJson: requirePayload(
        read(fields, "payload_json"),
        filePath,
        line,
      ),
      indexedAt: requireTimestamp(
        read(fields, "indexed_at"),
        "indexed_at",
        filePath,
        line,
      ),
    };
  });

  return { filePath, header, legacyHeader, checksumStatus: null, rows };
}

/**
 * Read an archive from disk, verifying its checksum first.
 *
 * `allowMissingChecksum` exists only for archives written before sidecars were
 * introduced; a *mismatched* checksum is never tolerated.
 */
export async function readArchiveFile(
  filePath: string,
  options: { allowMissingChecksum?: boolean } = {},
): Promise<ParsedArchive> {
  if (!fs.existsSync(filePath)) {
    throw new ArchiveFormatError(
      `Archive file not found: ${filePath}`,
      filePath,
    );
  }

  const verification = await assertArchiveChecksum(filePath, {
    allowMissing: options.allowMissingChecksum ?? false,
  });

  if (verification.status === "missing") {
    logRestoreProgress({
      message:
        `WARNING: ${filePath} has no checksum sidecar; importing unverified ` +
        `(ALLOW_UNVERIFIED_ARCHIVE=yes)`,
      rowsRead: 0,
      rowsInserted: 0,
      dryRun: true,
    });
  }

  const parsed = parseArchiveCsv(
    fs.readFileSync(filePath, "utf8"),
    filePath,
  );

  return { ...parsed, checksumStatus: verification.status };
}

/**
 * `INSERT ... VALUES ($1..$n), ... ON CONFLICT DO NOTHING RETURNING id`.
 *
 * `ON CONFLICT` is deliberately target-less: it covers the `tx_hash`
 * idempotency key (re-running a restore) *and* the `id` primary key (the
 * archiver's own row coming back), so a restore is always re-runnable.
 */
export function buildRestoreInsertQuery(rowCount: number): string {
  const columnCount = RESTORE_INSERT_COLUMNS.length;
  const valueTuples = Array.from({ length: rowCount }, (_, row) => {
    const placeholders = Array.from(
      { length: columnCount },
      (_, column) => `$${row * columnCount + column + 1}`,
    );
    return `(${placeholders.join(", ")})`;
  });

  return (
    `INSERT INTO ${RAFFLE_EVENTS_TABLE} (${RESTORE_INSERT_COLUMNS.join(", ")}) ` +
    `VALUES ${valueTuples.join(", ")} ` +
    `ON CONFLICT DO NOTHING ` +
    `RETURNING id`
  );
}

function toInsertParameters(row: ArchivedRaffleEvent): unknown[] {
  return [
    row.id,
    row.raffleId,
    row.eventType,
    row.schemaVersion,
    row.ledger,
    row.txHash,
    JSON.stringify(row.payloadJson),
    row.indexedAt.toISOString(),
    row.contractAddress,
  ];
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

/**
 * Insert parsed rows in bounded chunks. Returns how many rows were actually
 * written versus skipped because they were already present.
 */
export async function insertArchivedRows(
  manager: EntityManager,
  rows: ArchivedRaffleEvent[],
  batchSize: number,
): Promise<{ inserted: number; alreadyPresent: number }> {
  let inserted = 0;

  for (const chunk of chunkRows(rows, batchSize)) {
    const parameters = chunk.flatMap(toInsertParameters);
    const returned: Array<{ id: string }> = await manager.query(
      buildRestoreInsertQuery(chunk.length),
      parameters,
    );
    inserted += returned.length;
  }

  return { inserted, alreadyPresent: rows.length - inserted };
}

/** Count how many of `ids` are already in `raffle_events` (dry-run preview). */
async function countAlreadyPresent(
  manager: EntityManager,
  rows: ArchivedRaffleEvent[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const existing: Array<{ id: string }> = await manager.query(
    `SELECT id FROM ${RAFFLE_EVENTS_TABLE} WHERE id = ANY($1::uuid[])`,
    [rows.map((row) => row.id)],
  );
  return existing.length;
}

/**
 * Restore one archive file. Runs in a single transaction so a failure halfway
 * through a file leaves the table exactly as it was, and so re-running the same
 * file after an aborted import is safe.
 */
export async function restoreArchiveFile(
  dataSource: DataSource,
  archive: ParsedArchive,
  options: RestoreOptions = {},
): Promise<RestoreFileResult> {
  const dryRun = options.dryRun ?? RESTORE_DEFAULTS.dryRun;
  const batchSize = options.batchSize ?? RESTORE_DEFAULTS.batchSize;

  const result = await dataSource.transaction(async (manager) => {
    if (dryRun) {
      const alreadyPresent = await countAlreadyPresent(manager, archive.rows);
      return { inserted: 0, alreadyPresent };
    }
    return await insertArchivedRows(manager, archive.rows, batchSize);
  });

  return {
    filePath: archive.filePath,
    checksumStatus: archive.checksumStatus,
    rowsRead: archive.rows.length,
    rowsInserted: result.inserted,
    rowsAlreadyPresent: result.alreadyPresent,
  };
}

/**
 * Verify, parse and restore a list of archive files, in order.
 *
 * Each file is an independent unit of work: a failure on file 3 leaves files 1
 * and 2 restored and reports the error, so an operator can fix or exclude one
 * archive and re-run without double-inserting anything.
 */
export async function restoreRaffleEventsArchive(
  dataSource: DataSource,
  filePaths: string[],
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const dryRun = options.dryRun ?? RESTORE_DEFAULTS.dryRun;
  const allowMissingChecksum =
    options.allowMissingChecksum ?? RESTORE_DEFAULTS.allowMissingChecksum;

  const files: RestoreFileResult[] = [];

  for (const filePath of filePaths) {
    const archive = await readArchiveFile(filePath, { allowMissingChecksum });
    const fileResult = await restoreArchiveFile(dataSource, archive, options);
    files.push(fileResult);

    logRestoreProgress({
      message: dryRun
        ? `[DRY-RUN] ${filePath}: ${fileResult.rowsRead} rows read, ` +
          `would insert ${fileResult.rowsRead - fileResult.rowsAlreadyPresent}`
        : `Restored ${filePath}: ${fileResult.rowsInserted} inserted, ` +
          `${fileResult.rowsAlreadyPresent} already present`,
      rowsRead: fileResult.rowsRead,
      rowsInserted: fileResult.rowsInserted,
      rowsAlreadyPresent: fileResult.rowsAlreadyPresent,
      dryRun,
    });
  }

  return {
    dryRun,
    filesProcessed: files.length,
    rowsRead: files.reduce((total, file) => total + file.rowsRead, 0),
    rowsInserted: files.reduce((total, file) => total + file.rowsInserted, 0),
    rowsAlreadyPresent: files.reduce(
      (total, file) => total + file.rowsAlreadyPresent,
      0,
    ),
    files,
  };
}
