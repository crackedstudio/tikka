/**
 * Network-side helpers: reading the fee a transaction was actually charged and
 * deciding whether the network is in a **surge** state.
 *
 * Soroban inclusion fees are dynamic (protocol 22+): the minimum fee a
 * transaction must pay rises with ledger capacity usage, so an estimate taken
 * before congestion can be too low to be included. Both the SDK and the oracle
 * therefore need the same surge signal to know which tolerance band applies.
 */

import { PROTOCOL_BASE_FEE_STROOPS, toStroops } from './units';

/**
 * Distribution of Soroban inclusion fees over the RPC's recent-ledger window,
 * as returned by `getFeeStats()` (`sorobanInclusionFee`). Values are stroops.
 */
export interface SorobanInclusionFeeStatsLike {
  min?: string | number;
  mode?: string | number;
  p50?: string | number;
  p95?: string | number;
  max?: string | number;
}

/** Subset of the Soroban RPC / Horizon fee-stats payload this package reads. */
export interface NetworkFeeStatsLike {
  latestLedger?: number | string;
  ledgerCapacityUsage?: string | number;
  sorobanInclusionFee?: SorobanInclusionFeeStatsLike | null;
}

/** Result of inspecting the network's current fee conditions. */
export interface SurgeObservation {
  /** `true` when the typical inclusion fee is at or above the threshold. */
  surging: boolean;
  /** Representative (mode) inclusion fee in stroops; `0` when unknown. */
  inclusionFeeStroops: number;
  /** Cheapest inclusion fee observed in the window; `0` when unknown. */
  minInclusionFeeStroops: number;
  /** Most expensive inclusion fee observed in the window; `0` when unknown. */
  maxInclusionFeeStroops: number;
  /** Threshold the observation was compared against. */
  thresholdStroops: number;
  /** Latest ledger the stats were computed from, when reported. */
  latestLedger?: number;
  /** Human-readable explanation, surfaced in reports. */
  reason: string;
}

/**
 * Extracts the fee **actually charged** by the network for a transaction.
 *
 * Handles every shape the two stacks see:
 * - a Soroban RPC `getTransaction` response, whose `resultXdr`
 *   (`xdr.TransactionResult`) exposes `feeCharged()` returning an `xdr.Int64`
 * - a bare `xdr.TransactionResult`
 * - Soroban RPC `getTransaction` JSON → `feeCharged: "50100"`
 * - Horizon transaction JSON → `fee_charged: 50100`
 * - a bare number / numeric string (e.g. a value already extracted upstream)
 *
 * @returns the charged fee in stroops, or `undefined` when the payload carries
 * no fee. Callers must treat `undefined` as "unknown", never as `0` — a
 * confirmed Soroban transaction always pays at least the base fee, so a zero
 * charge means the value was never captured.
 */
export function extractFeeChargedStroops(payload: unknown): number | undefined {
  if (payload === null || payload === undefined) return undefined;

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['feeCharged', 'fee_charged']) {
      if (key in record) {
        const raw = record[key];
        const resolved = typeof raw === 'function' ? (raw as () => unknown).call(record) : raw;
        return toStroops(resolved);
      }
    }

    // `getTransaction` wraps the result; the fee lives on the result itself.
    if ('resultXdr' in record) {
      return extractFeeChargedStroops(record['resultXdr']);
    }
  }

  return toStroops(payload);
}

/**
 * Classifies the network's current fee conditions.
 *
 * A run counts as **surged** when the *typical* inclusion fee — the mode of the
 * recent-ledger window, or the cheapest fee in that window — is at or above
 * `thresholdStroops`. Using the mode (rather than the max) keeps a single
 * expensive ledger from classifying an otherwise quiet network as surged.
 *
 * @param stats - `getFeeStats()` response, or `null`/`undefined` when unavailable.
 * @param thresholdStroops - inclusion fee above which the network counts as surged.
 */
export function detectSurge(
  stats: NetworkFeeStatsLike | null | undefined,
  thresholdStroops: number,
): SurgeObservation {
  const inclusion = stats?.sorobanInclusionFee ?? undefined;
  const mode = toStroops(inclusion?.mode) ?? 0;
  const min = toStroops(inclusion?.min) ?? 0;
  const max = toStroops(inclusion?.max) ?? 0;
  const latestLedger = toStroops(stats?.latestLedger);

  const threshold =
    Number.isFinite(thresholdStroops) && thresholdStroops > 0 ? thresholdStroops : 0;
  const surging = threshold > 0 && (mode >= threshold || min >= threshold);

  const reason =
    !stats || !inclusion
      ? 'Inclusion fee stats unavailable — treating the network as not surged.'
      : surging
        ? `Inclusion fee (mode ${mode} stroops, min ${min} stroops) is at or above the surge threshold of ${threshold} stroops.`
        : `Inclusion fee (mode ${mode} stroops, min ${min} stroops) is below the surge threshold of ${threshold} stroops.`;

  return {
    surging,
    inclusionFeeStroops: mode,
    minInclusionFeeStroops: min,
    maxInclusionFeeStroops: max,
    thresholdStroops: threshold,
    latestLedger,
    reason,
  };
}

/**
 * Lowest inclusion fee the network currently demands.
 *
 * Used to check that a quote could actually have been included: a quote below
 * this value produces a `tx_insufficient_fee` rejection rather than a charge.
 */
export function minimumInclusionFeeStroops(
  inclusionFeeStroops: number | undefined,
  baseFeeStroops: number = PROTOCOL_BASE_FEE_STROOPS,
): number {
  const observed = Number.isFinite(inclusionFeeStroops as number)
    ? Math.max(0, Math.floor(inclusionFeeStroops as number))
    : 0;
  return Math.max(observed, baseFeeStroops);
}
