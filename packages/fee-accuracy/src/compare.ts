/**
 * The comparison harness: turns a set of (quoted fee, charged fee) pairs into a
 * pass/fail verdict with an explicit tolerance.
 *
 * Both fee estimators in this monorepo are validated by the same code:
 *
 * | Estimator            | Quoted from                                    | Charged by                         |
 * | -------------------- | ----------------------------------------------- | ---------------------------------- |
 * | SDK `FeeEstimatorService` | `simulateTransaction` → `minResourceFee` | the on-chain `resultXdr.feeCharged` |
 * | Oracle `FeeStrategyService` | `getFeeStats()` p95 inclusion fee     | the on-chain `resultXdr.feeCharged` |
 *
 * A consistently low estimate produces failed transactions; a consistently high
 * one overcharges the user. Both directions therefore fail the run once they
 * leave the tolerance band.
 */

import { toStroops } from './units';

// ─── Tolerance model ──────────────────────────────────────────────────────────

/**
 * Allowed deviation between a quoted fee and the fee actually charged.
 *
 * The effective band is `max(absoluteStroops, estimated * relativePercent / 100)`
 * so that small transactions are not judged on a percentage that rounds to less
 * than a single stroop, and large ones are not judged on an absolute band that
 * is meaningless next to them.
 */
export interface FeeTolerance {
  /** Maximum allowed deviation as a percentage of the estimate. */
  relativePercent: number;
  /** Absolute stroop slack applied before the relative check. */
  absoluteStroops: number;
}

/** Tolerance used while the network is calm. */
export const NORMAL_TOLERANCE: FeeTolerance = {
  relativePercent: 15,
  absoluteStroops: 2_000,
};

/**
 * Tolerance used while the network is surged. Soroban inclusion fees move
 * between the estimate and inclusion, so the band is widened to a factor of
 * two; an estimate that misses by more than that under surge is still reported
 * as drift.
 */
export const SURGE_TOLERANCE: FeeTolerance = {
  relativePercent: 100,
  absoluteStroops: 10_000,
};

/** Default inclusion fee (stroops) at or above which a run counts as surged. */
export const DEFAULT_SURGE_THRESHOLD_STROOPS = 1_000;

/** Full configuration for {@link evaluateFeeAccuracy}. */
export interface FeeAccuracyConfig {
  /** Band applied to observations taken while the network is calm. */
  normalTolerance: FeeTolerance;
  /** Band applied to observations taken while the network is surged. */
  surgeTolerance: FeeTolerance;
  /** Inclusion fee at or above which the network counts as surged. */
  surgeThresholdStroops: number;
}

/** Defaults used when no environment overrides are supplied. */
export const DEFAULT_FEE_ACCURACY_CONFIG: FeeAccuracyConfig = {
  normalTolerance: { ...NORMAL_TOLERANCE },
  surgeTolerance: { ...SURGE_TOLERANCE },
  surgeThresholdStroops: DEFAULT_SURGE_THRESHOLD_STROOPS,
};

/** Environment variable overrides understood by {@link resolveFeeAccuracyConfig}. */
export const FEE_ACCURACY_ENV_KEYS = {
  normalRelativePercent: 'TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT',
  normalAbsoluteStroops: 'TIKKA_FEE_ACCURACY_TOLERANCE_STROOPS',
  surgeRelativePercent: 'TIKKA_FEE_SURGE_TOLERANCE_PERCENT',
  surgeAbsoluteStroops: 'TIKKA_FEE_SURGE_TOLERANCE_STROOPS',
  surgeThresholdStroops: 'TIKKA_FEE_SURGE_THRESHOLD_STROOPS',
} as const;

type EnvLike = Record<string, string | undefined>;

function positiveNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Resolves the tolerance configuration from the environment, falling back to
 * {@link DEFAULT_FEE_ACCURACY_CONFIG}.
 *
 * Lets the scheduled testnet run tighten or loosen the band without a code
 * change (e.g. while investigating a surge).
 */
export function resolveFeeAccuracyConfig(
  env: EnvLike = process.env,
  overrides: Partial<FeeAccuracyConfig> = {},
): FeeAccuracyConfig {
  return {
    normalTolerance: {
      relativePercent:
        positiveNumber(env[FEE_ACCURACY_ENV_KEYS.normalRelativePercent]) ??
        overrides.normalTolerance?.relativePercent ??
        DEFAULT_FEE_ACCURACY_CONFIG.normalTolerance.relativePercent,
      absoluteStroops:
        toStroops(env[FEE_ACCURACY_ENV_KEYS.normalAbsoluteStroops]) ??
        overrides.normalTolerance?.absoluteStroops ??
        DEFAULT_FEE_ACCURACY_CONFIG.normalTolerance.absoluteStroops,
    },
    surgeTolerance: {
      relativePercent:
        positiveNumber(env[FEE_ACCURACY_ENV_KEYS.surgeRelativePercent]) ??
        overrides.surgeTolerance?.relativePercent ??
        DEFAULT_FEE_ACCURACY_CONFIG.surgeTolerance.relativePercent,
      absoluteStroops:
        toStroops(env[FEE_ACCURACY_ENV_KEYS.surgeAbsoluteStroops]) ??
        overrides.surgeTolerance?.absoluteStroops ??
        DEFAULT_FEE_ACCURACY_CONFIG.surgeTolerance.absoluteStroops,
    },
    surgeThresholdStroops:
      toStroops(env[FEE_ACCURACY_ENV_KEYS.surgeThresholdStroops]) ??
      overrides.surgeThresholdStroops ??
      DEFAULT_FEE_ACCURACY_CONFIG.surgeThresholdStroops,
  };
}

/** Effective band (in stroops) for an estimate under `tolerance`. */
export function allowedDeltaStroops(estimateStroops: number, tolerance: FeeTolerance): number {
  const relative = (Math.max(0, estimateStroops) * tolerance.relativePercent) / 100;
  return Math.max(tolerance.absoluteStroops, relative);
}

// ─── Comparison ───────────────────────────────────────────────────────────────

/** One quoted-fee / charged-fee pair under test. */
export interface FeeObservation {
  /** What was measured, e.g. `sdk.buy_ticket` or `oracle.prng_reveal`. */
  label: string;
  /**
   * Fee the estimator quoted to the caller, in stroops.
   * `undefined` is accepted (and reported as `invalid`) so callers can pass a
   * quote straight through without pre-validating it.
   */
  estimatedStroops: number | string | undefined;
  /**
   * Fee the network actually charged, in stroops. `undefined` (or any
   * non-positive value) means the charge was never captured and the comparison
   * is reported as `invalid` — never as a pass.
   */
  actualStroops: number | string | undefined;
  /** Whether the network was surged when the transaction was included. */
  surge?: boolean;
  /** Extra context rendered in reports (tx hash, ledger, cpu instructions …). */
  details?: Record<string, string | number | boolean | undefined>;
}

/**
 * Outcome of a single comparison.
 *
 * - `accurate`    — charge landed inside the band.
 * - `under-quoted`— charge exceeded the quote (the estimate was too low).
 * - `over-quoted` — charge landed well below the quote (the user was overcharged).
 * - `invalid`     — one of the two numbers is unusable, so nothing was proven.
 */
export type FeeVerdict = 'accurate' | 'under-quoted' | 'over-quoted' | 'invalid';

/** Result of comparing a single observation against its tolerance band. */
export interface FeeComparison {
  label: string;
  estimatedStroops: number;
  actualStroops: number;
  /** `actual - estimated`, in stroops. */
  deltaStroops: number;
  /** `deltaStroops` as a percentage of the estimate; `0` when the estimate is 0. */
  deltaPercent: number;
  /** Absolute deviation that would still have passed, in stroops. */
  allowedDeltaStroops: number;
  /** Relative deviation that would still have passed, as a percentage. */
  tolerancePercent: number;
  surge: boolean;
  verdict: FeeVerdict;
  passed: boolean;
  /** Why the verdict was reached; always populated. */
  reason: string;
  details?: FeeObservation['details'];
}

function isPositiveStroops(value: number | undefined): value is number {
  return value !== undefined && value > 0;
}

/**
 * Compares one quoted fee against the fee the network charged.
 *
 * A non-positive *actual* value is always `invalid`: a confirmed Soroban
 * transaction always pays at least the base fee, so a zero charge means the
 * caller never captured the real value (a hardcoded `feePaid: 0`, for example)
 * and any accuracy verdict built on it would be meaningless.
 */
export function compareFeeObservation(
  observation: FeeObservation,
  config: FeeAccuracyConfig = DEFAULT_FEE_ACCURACY_CONFIG,
): FeeComparison {
  const surge = observation.surge === true;
  const tolerance = surge ? config.surgeTolerance : config.normalTolerance;
  const estimated = toStroops(observation.estimatedStroops) ?? 0;
  const actual = toStroops(observation.actualStroops) ?? 0;

  const base: Omit<FeeComparison, 'verdict' | 'passed' | 'reason'> = {
    label: observation.label,
    estimatedStroops: estimated,
    actualStroops: actual,
    deltaStroops: 0,
    deltaPercent: 0,
    allowedDeltaStroops: allowedDeltaStroops(estimated, tolerance),
    tolerancePercent: tolerance.relativePercent,
    surge,
    details: observation.details,
  };

  if (!isPositiveStroops(estimated)) {
    return {
      ...base,
      verdict: 'invalid',
      passed: false,
      reason:
        `Quoted fee ${observation.estimatedStroops} is not a positive stroop amount — ` +
        'the estimator returned nothing usable to compare against the network.',
    };
  }

  if (!isPositiveStroops(actual)) {
    return {
      ...base,
      verdict: 'invalid',
      passed: false,
      reason:
        `Network reported a fee of ${observation.actualStroops} stroops for a confirmed ` +
        'transaction — a real charge is always positive, so the charged fee was never ' +
        'captured (check for a hardcoded feePaid).',
    };
  }

  const deltaStroops = actual - estimated;
  const deltaPercent = (deltaStroops / estimated) * 100;
  const allowed = base.allowedDeltaStroops;
  const withinBand = Math.abs(deltaStroops) <= allowed;

  const verdict: FeeVerdict = withinBand
    ? 'accurate'
    : deltaStroops > 0
      ? 'under-quoted'
      : 'over-quoted';

  const direction =
    verdict === 'under-quoted'
      ? 'charged more than quoted (transactions at this fee can be rejected under load)'
      : 'charged less than quoted (the user was quoted more than the network took)';

  return {
    ...base,
    deltaStroops,
    deltaPercent,
    verdict,
    passed: withinBand,
    reason: withinBand
      ? `Charge landed within the ${surge ? 'surge' : 'normal'} band (±${allowed} stroops).`
      : `Estimate drifted by ${deltaStroops} stroops (${deltaPercent.toFixed(1)}%), outside the ` +
        `${surge ? 'surge' : 'normal'} band of ±${allowed} stroops (±${tolerance.relativePercent}%) — ` +
        `the network ${direction}.`,
  };
}

// ─── Report ───────────────────────────────────────────────────────────────────

/** Aggregated verdict over every observation of a run. */
export interface FeeAccuracyReport {
  /** `true` when every observation stayed inside its tolerance band. */
  passed: boolean;
  /** `true` when at least one observation was taken during a surge. */
  surgeDetected: boolean;
  comparisons: FeeComparison[];
  /** Comparisons that failed, in observation order. */
  failures: FeeComparison[];
  tolerance: { normal: FeeTolerance; surge: FeeTolerance };
  surgeThresholdStroops: number;
  /** ISO timestamp of the evaluation. */
  generatedAt: string;
  /** One-line summary suitable for logs and job summaries. */
  summary: string;
}

/** Report shape as persisted to disk (no derived helpers). */
export type FeeAccuracyReportFile = Omit<FeeAccuracyReport, 'summary'>;

/**
 * Evaluates a set of observations and produces the report both CI jobs and the
 * scheduled testnet run gate on.
 */
export function evaluateFeeAccuracy(
  observations: FeeObservation[],
  config: FeeAccuracyConfig = DEFAULT_FEE_ACCURACY_CONFIG,
  now: Date = new Date(),
): FeeAccuracyReport {
  const comparisons = observations.map((observation) => compareFeeObservation(observation, config));
  const failures = comparisons.filter((comparison) => !comparison.passed);
  const surgeDetected = comparisons.some((comparison) => comparison.surge);
  const passed = failures.length === 0 && comparisons.length > 0;

  const summary = comparisons.length
    ? passed
      ? `Fee estimates matched network charges within tolerance (${comparisons.length} observation${
          comparisons.length === 1 ? '' : 's'
        }${surgeDetected ? ', surge band applied' : ''}).`
      : `${failures.length} of ${comparisons.length} fee observation${
          comparisons.length === 1 ? '' : 's'
        } drifted outside tolerance.`
    : 'No fee observations were recorded.';

  return {
    passed,
    surgeDetected,
    comparisons,
    failures,
    tolerance: {
      normal: config.normalTolerance,
      surge: config.surgeTolerance,
    },
    surgeThresholdStroops: config.surgeThresholdStroops,
    generatedAt: now.toISOString(),
    summary,
  };
}

/** JSON-safe projection of a report (drops the derived `summary`). */
export function toReportFile(report: FeeAccuracyReport): FeeAccuracyReportFile {
  const { summary, ...rest } = report;
  void summary;
  return rest;
}
