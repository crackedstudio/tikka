import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Content checksums for archive CSV files.
 *
 * Once a batch commits, the CSV is the only remaining copy of those rows, so
 * every archive file gets a `<file>.csv.sha256` sidecar written as part of the
 * same write. `restore` re-reads the file and refuses to import it when the
 * bytes no longer match the recorded hash — a truncated, edited, or
 * half-synced-to-S3 archive must never be treated as authoritative.
 *
 * The sidecar deliberately uses the `sha256sum` text format
 * (`<hex>  <basename>`) so an operator can verify it with standard tooling:
 *
 *     sha256sum -c raffle_events_2026-01-15_batch0001.csv.sha256
 *
 * Pure filesystem + crypto: no TypeORM, no configuration, no logging, so the
 * behaviour is unit-testable without a database (`checksum.spec.ts`).
 */

/** Suffix appended to the archive path to locate its checksum sidecar. */
export const ARCHIVE_CHECKSUM_SUFFIX = ".sha256";

/** Length of a hex-encoded SHA-256 digest. */
const SHA256_HEX_LENGTH = 64;

export type ArchiveChecksumStatus = "ok" | "missing" | "mismatch";

export interface ArchiveChecksumVerification {
  status: ArchiveChecksumStatus;
  /** The archive CSV that was checked. */
  archivePath: string;
  /** Where the expected hash was read from (`<archivePath>.sha256`). */
  checksumPath: string;
  /** Hash recorded next to the archive; null when the sidecar is unreadable. */
  expectedHash: string | null;
  /** Hash of the bytes currently on disk. */
  actualHash: string;
  checkedAt: Date;
  reason?: string;
}

/**
 * Thrown when an archive cannot be proven intact. Carries both hashes so an
 * operator can triage from the log line alone, and so `restore` can abort
 * before any row reaches the database.
 */
export class ArchiveIntegrityError extends Error {
  constructor(
    message: string,
    public readonly archivePath: string,
    public readonly expectedHash: string | null,
    public readonly actualHash: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "ArchiveIntegrityError";
  }
}

/** `<archivePath>.sha256` — the sidecar that travels with the CSV. */
export function archiveChecksumPath(archivePath: string): string {
  return `${archivePath}${ARCHIVE_CHECKSUM_SUFFIX}`;
}

/**
 * SHA-256 (hex) of a file's contents, streamed so a multi-gigabyte archive
 * never has to be held in memory.
 */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** One `sha256sum` record: the digest, two spaces, the file's basename. */
export function serializeArchiveChecksum(
  hash: string,
  archivePath: string,
): string {
  return `${hash}  ${path.basename(archivePath)}\n`;
}

/**
 * Extract the digest from a `sha256sum` sidecar. Returns null for a sidecar
 * that is missing, empty, or does not start with a hex SHA-256 digest — all of
 * which are treated as "no usable checksum" rather than as a mismatch.
 */
export function parseArchiveChecksum(content: string): string | null {
  const [digest] = content.trim().split(/\s+/);
  if (!digest || !/^[0-9a-f]+$/i.test(digest)) {
    return null;
  }
  if (digest.length !== SHA256_HEX_LENGTH) {
    return null;
  }
  return digest.toLowerCase();
}

/** The digest recorded beside `archivePath`, or null when there is none. */
export function readExpectedArchiveHash(archivePath: string): string | null {
  const checksumPath = archiveChecksumPath(archivePath);
  if (!fs.existsSync(checksumPath)) {
    return null;
  }
  return parseArchiveChecksum(fs.readFileSync(checksumPath, "utf8"));
}

/**
 * Write the sidecar for an already-flushed archive file.
 *
 * Called by `writer.writeBatchToCsv` (which hashes the bytes as it writes them)
 * and by any tool that produces or re-uploads archives outside the archiver.
 */
export async function writeArchiveChecksum(archivePath: string): Promise<string> {
  const hash = await computeFileSha256(archivePath);
  fs.writeFileSync(
    archiveChecksumPath(archivePath),
    serializeArchiveChecksum(hash, archivePath),
    "utf8",
  );
  return hash;
}

/**
 * Re-hash an archive file and compare it with its sidecar.
 *
 *  - sidecar missing/unreadable : 'missing'
 *  - hashes differ              : 'mismatch'
 *  - hashes match               : 'ok'
 */
export async function verifyArchiveChecksum(
  archivePath: string,
): Promise<ArchiveChecksumVerification> {
  const checksumPath = archiveChecksumPath(archivePath);
  const expectedHash = readExpectedArchiveHash(archivePath);
  const actualHash = await computeFileSha256(archivePath);
  const checkedAt = new Date();

  if (expectedHash == null) {
    return {
      status: "missing",
      archivePath,
      checksumPath,
      expectedHash: null,
      actualHash,
      checkedAt,
      reason: `No readable SHA-256 sidecar at ${checksumPath}`,
    };
  }

  if (expectedHash !== actualHash) {
    return {
      status: "mismatch",
      archivePath,
      checksumPath,
      expectedHash,
      actualHash,
      checkedAt,
      reason: "Archive contents do not match the recorded SHA-256",
    };
  }

  return {
    status: "ok",
    archivePath,
    checksumPath,
    expectedHash,
    actualHash,
    checkedAt,
  };
}

export interface AssertArchiveChecksumOptions {
  /**
   * Treat a *missing* sidecar as acceptable (archives written before checksums
   * existed). A mismatch is never acceptable, whatever this is set to.
   */
  allowMissing?: boolean;
}

/**
 * Verify an archive and throw `ArchiveIntegrityError` unless the bytes match
 * the recorded hash. This is the gate `restore` runs before parsing a file.
 *
 * Resolves with `missing` only when `allowMissing` was explicitly requested, so
 * the caller can report that the import was unverified.
 */
export async function assertArchiveChecksum(
  archivePath: string,
  options: AssertArchiveChecksumOptions = {},
): Promise<ArchiveChecksumVerification> {
  const verification = await verifyArchiveChecksum(archivePath);

  if (verification.status === "ok") {
    return verification;
  }

  if (verification.status === "missing" && options.allowMissing) {
    return verification;
  }

  throw new ArchiveIntegrityError(
    `Refusing to read archive ${archivePath}: ${verification.reason}. ` +
      `Expected ${verification.expectedHash ?? "(no sidecar)"}, computed ${verification.actualHash}.`,
    archivePath,
    verification.expectedHash,
    verification.actualHash,
    verification.reason ?? "Archive integrity check failed",
  );
}
