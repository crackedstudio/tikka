/**
 * cursor-integrity.ts
 *
 * Pure validation functions for CursorCheckpoint integrity.
 * No I/O, no side effects — safe to unit-test without any infrastructure.
 *
 * See docs/cursor-checkpoint-integrity.md for the full operator guide.
 */

/** Current schema version. Increment whenever CursorCheckpoint's shape changes. */
export const CURSOR_CHECKPOINT_VERSION = 1;

/**
 * Cursor checkpoint persisted between indexer restarts.
 *
 * All fields are validated before every save and on startup load.
 * Any violation transitions the ingestion pipeline to DEGRADED mode.
 */
export interface CursorCheckpoint {
  /**
   * Ledger sequence number.
   * Invariant: strictly greater than the previously persisted sequence.
   */
  sequence: number;

  /**
   * Hash of the ledger at this sequence, as reported by the chain.
   * Used for fork/reorg detection: if the chain later reports a different
   * hash for the same sequence, a HASH_MISMATCH violation is raised.
   */
  ledgerHash: string;

  /**
   * Cumulative count of events processed up to and including this ledger.
   * Invariant: monotonically non-decreasing. A decrease indicates that
   * state has been corrupted or rolled back without a corresponding
   * sequence rollback.
   */
  processedEventCount: number;

  /**
   * ISO-8601 timestamp of when this checkpoint was written.
   * Validated with `new Date(savedAt)` — an unparseable value raises
   * INVALID_SAVED_AT and transitions to DEGRADED.
   */
  savedAt: string;

  /**
   * Schema version for forward-compatible migration.
   * Must equal CURSOR_CHECKPOINT_VERSION. A mismatch means the stored
   * checkpoint was written by a different binary version and may not be
   * safe to resume from.
   */
  version: number;
}

/**
 * Describes the first integrity violation detected in a checkpoint.
 * Returned by the validate* functions; never thrown directly — callers
 * wrap it in a CursorIntegrityError when they need to propagate it.
 *
 * Variants:
 * - SEQUENCE_REGRESSION    — candidate.sequence < previous.sequence
 * - SEQUENCE_DUPLICATE     — candidate.sequence === previous.sequence
 * - HASH_MISMATCH          — chain-reported hash differs from stored hash
 * - EVENT_COUNT_REGRESSION — candidate.processedEventCount < previous.processedEventCount
 * - INVALID_SAVED_AT       — savedAt cannot be parsed as a valid date
 * - VERSION_MISMATCH       — stored version !== CURSOR_CHECKPOINT_VERSION
 * - MISSING_REQUIRED_FIELD — a required field is null or undefined
 * - CORRUPTED_CHECKPOINT   — the stored value is not a valid checkpoint object
 */
export type IntegrityViolation =
  /** candidate.sequence is less than the previously saved sequence. */
  | { code: "SEQUENCE_REGRESSION"; current: number; previous: number }
  /** candidate.sequence equals the previously saved sequence (no-op write is not allowed). */
  | { code: "SEQUENCE_DUPLICATE"; sequence: number }
  /** The hash returned by the chain for this sequence differs from what was stored. */
  | { code: "HASH_MISMATCH"; sequence: number; stored: string; actual: string }
  /** candidate.processedEventCount is less than the previously saved count. */
  | { code: "EVENT_COUNT_REGRESSION"; current: number; previous: number }
  /** savedAt is present but cannot be parsed as a valid ISO-8601 date. */
  | { code: "INVALID_SAVED_AT"; value: string }
  /** The stored checkpoint version does not match CURSOR_CHECKPOINT_VERSION. */
  | { code: "VERSION_MISMATCH"; stored: number; expected: number }
  /** A required field is null or undefined in the stored checkpoint. */
  | { code: "MISSING_REQUIRED_FIELD"; field: keyof CursorCheckpoint }
  /** The stored value is not an object, or a field has the wrong primitive type. */
  | { code: "CORRUPTED_CHECKPOINT"; detail: string };

// ── Internal helpers ──────────────────────────────────────────────────────────

function checkStructure(candidate: unknown): IntegrityViolation | null {
  if (candidate === null || typeof candidate !== "object") {
    return { code: "CORRUPTED_CHECKPOINT", detail: "not an object" };
  }
  const c = candidate as Record<string, unknown>;
  const required: Array<keyof CursorCheckpoint> = [
    "sequence",
    "ledgerHash",
    "processedEventCount",
    "savedAt",
    "version",
  ];
  for (const field of required) {
    if (c[field] === undefined || c[field] === null) {
      return { code: "MISSING_REQUIRED_FIELD", field };
    }
  }
  if (typeof c.sequence !== "number") {
    return {
      code: "CORRUPTED_CHECKPOINT",
      detail: "sequence must be a number",
    };
  }
  if (typeof c.ledgerHash !== "string") {
    return {
      code: "CORRUPTED_CHECKPOINT",
      detail: "ledgerHash must be a string",
    };
  }
  if (typeof c.processedEventCount !== "number") {
    return {
      code: "CORRUPTED_CHECKPOINT",
      detail: "processedEventCount must be a number",
    };
  }
  if (typeof c.savedAt !== "string") {
    return { code: "CORRUPTED_CHECKPOINT", detail: "savedAt must be a string" };
  }
  if (typeof c.version !== "number") {
    return { code: "CORRUPTED_CHECKPOINT", detail: "version must be a number" };
  }
  return null;
}

function checkSavedAt(value: string): IntegrityViolation | null {
  const d = new Date(value);
  if (isNaN(d.getTime())) return { code: "INVALID_SAVED_AT", value };
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a candidate checkpoint against the last known good checkpoint.
 * Called before every save to `CursorManagerService.saveCursor()`.
 *
 * @param candidate - The checkpoint about to be written.
 * @param previous  - The last successfully persisted checkpoint, or null on
 *                    the very first save.
 * @returns `null` if the candidate is valid; the first detected
 *          `IntegrityViolation` otherwise.
 *
 * Checks performed (in order):
 * 1. All required fields are present and have the correct primitive type.
 * 2. `savedAt` is a parseable ISO-8601 date string.
 * 3. `version` equals `CURSOR_CHECKPOINT_VERSION`.
 * 4. If `previous !== null`: `sequence` is not equal to `previous.sequence`
 *    (SEQUENCE_DUPLICATE).
 * 5. If `previous !== null`: `sequence` is strictly greater than
 *    `previous.sequence` (SEQUENCE_REGRESSION).
 * 6. If `previous !== null`: `processedEventCount` is not less than
 *    `previous.processedEventCount` (EVENT_COUNT_REGRESSION).
 */
export function validateBeforeSave(
  candidate: CursorCheckpoint,
  previous: CursorCheckpoint | null,
): IntegrityViolation | null {
  const structural = checkStructure(candidate);
  if (structural) return structural;

  const savedAtViolation = checkSavedAt(candidate.savedAt);
  if (savedAtViolation) return savedAtViolation;

  if (candidate.version !== CURSOR_CHECKPOINT_VERSION) {
    return {
      code: "VERSION_MISMATCH",
      stored: candidate.version,
      expected: CURSOR_CHECKPOINT_VERSION,
    };
  }

  if (previous !== null) {
    if (candidate.sequence === previous.sequence) {
      return { code: "SEQUENCE_DUPLICATE", sequence: candidate.sequence };
    }
    if (candidate.sequence < previous.sequence) {
      return {
        code: "SEQUENCE_REGRESSION",
        current: candidate.sequence,
        previous: previous.sequence,
      };
    }
    if (candidate.processedEventCount < previous.processedEventCount) {
      return {
        code: "EVENT_COUNT_REGRESSION",
        current: candidate.processedEventCount,
        previous: previous.processedEventCount,
      };
    }
  }

  return null;
}

/**
 * Validate a checkpoint loaded from storage on indexer startup.
 * Called once by `CursorManagerService.getCursor()` before the ingestor
 * loop begins. A violation here means the persisted state is unsafe to
 * resume from and the indexer must not start.
 *
 * @param stored - The raw value read from the database (typed as `unknown`
 *                 because the DB schema may have drifted).
 * @returns `null` if the stored checkpoint is safe to resume from; the first
 *          detected `IntegrityViolation` otherwise.
 *
 * Checks performed (in order):
 * 1. `stored` is a non-null object with all required fields of correct types.
 * 2. `savedAt` is a parseable ISO-8601 date string.
 * 3. `version` equals `CURSOR_CHECKPOINT_VERSION` (VERSION_MISMATCH triggers
 *    DEGRADED so a new binary cannot silently misread an old format).
 * 4. `processedEventCount` is >= 0.
 */
export function validateOnLoad(stored: unknown): IntegrityViolation | null {
  const structural = checkStructure(stored);
  if (structural) return structural;

  const c = stored as CursorCheckpoint;

  const savedAtViolation = checkSavedAt(c.savedAt);
  if (savedAtViolation) return savedAtViolation;

  if (c.version !== CURSOR_CHECKPOINT_VERSION) {
    return {
      code: "VERSION_MISMATCH",
      stored: c.version,
      expected: CURSOR_CHECKPOINT_VERSION,
    };
  }

  if (c.processedEventCount < 0) {
    return {
      code: "CORRUPTED_CHECKPOINT",
      detail: "processedEventCount must be >= 0",
    };
  }

  return null;
}

export class CursorIntegrity {
  static validate(stored: unknown): IntegrityViolation | null {
    return validateOnLoad(stored);
  }
}

/**
 * Validate the ledger hash reported by the chain against the hash stored in
 * the checkpoint for the same sequence.
 * Called by `CursorManagerService.checkForReorg()` after fetching each ledger,
 * before processing its events.
 *
 * @param checkpoint - The stored checkpoint for this sequence.
 * @param actualHash - The hash returned by the chain RPC for this sequence.
 * @returns `null` if the hashes match (no fork detected); a `HASH_MISMATCH`
 *          violation if they differ, indicating a chain reorganisation.
 */
export function validateLedgerHash(
  checkpoint: CursorCheckpoint,
  actualHash: string,
): IntegrityViolation | null {
  if (checkpoint.ledgerHash !== actualHash) {
    return {
      code: "HASH_MISMATCH",
      sequence: checkpoint.sequence,
      stored: checkpoint.ledgerHash,
      actual: actualHash,
    };
  }
  return null;
}
