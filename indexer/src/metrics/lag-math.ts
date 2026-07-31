import { CursorCheckpoint } from '../ingestor/cursor-integrity';

/**
 * Pure helpers that compute ingestion-lag from the network tip cached by
 * `LagProbeService` and the last persisted `CursorCheckpoint`. Extracted into
 * a leaf-level module so they can be exercised in unit tests without pulling
 * in the `HealthService` / processor / webhook transitive chain, which on
 * `master` is currently broken at the `webhook-delivery.entity` import.
 *
 * Issue: #1110
 */

export interface NetworkTipView {
  sequence: number | null;
  closedAt: Date | null;
}

/**
 * Returns the ledger lag = `max(0, networkTip.sequence − cursor.sequence)`.
 * Returns `0` if either input is missing (probe not warmed, cursor not yet
 * written, or zero-valued on a brand-new chain).
 */
export function computeIngestionLagLedgers(
  networkTip: NetworkTipView,
  cursor: CursorCheckpoint | null | undefined,
): number {
  const tipSequence = networkTip.sequence;
  const cursorSequence = cursor?.sequence;
  if (tipSequence == null || cursorSequence == null) {
    return 0;
  }
  return Math.max(0, tipSequence - cursorSequence);
}

/**
 * Returns the wall-clock lag in seconds = `max(0, (networkTip.closedAt − cursor.savedAt) / 1000)`.
 * Returns `0` if either timestamp is missing or unparseable.
 */
export function computeIngestionLagSeconds(
  networkTip: NetworkTipView,
  cursor: CursorCheckpoint | null | undefined,
): number {
  const tipClosedAt = networkTip.closedAt;
  const lastSavedAt = cursor?.savedAt;
  if (!tipClosedAt || !lastSavedAt) {
    return 0;
  }

  const tipMs =
    tipClosedAt instanceof Date
      ? tipClosedAt.getTime()
      : new Date(tipClosedAt).getTime();
  const savedMs =
    typeof lastSavedAt === 'string'
      ? new Date(lastSavedAt).getTime()
      : new Date(String(lastSavedAt)).getTime();

  if (Number.isNaN(tipMs) || Number.isNaN(savedMs)) {
    return 0;
  }
  return Math.max(0, (tipMs - savedMs) / 1000);
}
