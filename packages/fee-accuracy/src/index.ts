/**
 * `@tikka/fee-accuracy`
 *
 * One estimate-vs-actual fee comparison harness, shared by the SDK fee
 * estimator (`sdk/src/fee-estimator`) and the oracle cost estimator
 * (`oracle/src/submitter`), so both are validated by the same tolerance,
 * the same surge classification and the same report format.
 *
 * The package is intentionally dependency-free (no Stellar SDK, no Nest) and
 * exposes its TypeScript source directly, so consumers need no build step.
 *
 * @example
 * ```ts
 * const config = resolveFeeAccuracyConfig();
 * const surge = detectSurge(await rpc.getFeeStats(), config.surgeThresholdStroops);
 * const report = evaluateFeeAccuracy(
 *   [{ label: 'sdk.buy_ticket', estimatedStroops: quote.stroops, actualStroops: charged, surge: surge.surging }],
 *   config,
 * );
 * if (!report.passed) throw new Error(report.failures[0].reason);
 * ```
 */

export { PROTOCOL_BASE_FEE_STROOPS, STROOPS_PER_XLM, stroopsToXlmString, toStroops } from './units';

export {
  detectSurge,
  extractFeeChargedStroops,
  minimumInclusionFeeStroops,
  type NetworkFeeStatsLike,
  type SorobanInclusionFeeStatsLike,
  type SurgeObservation,
} from './network';

export {
  allowedDeltaStroops,
  compareFeeObservation,
  DEFAULT_FEE_ACCURACY_CONFIG,
  DEFAULT_SURGE_THRESHOLD_STROOPS,
  evaluateFeeAccuracy,
  FEE_ACCURACY_ENV_KEYS,
  NORMAL_TOLERANCE,
  resolveFeeAccuracyConfig,
  SURGE_TOLERANCE,
  toReportFile,
  type FeeAccuracyConfig,
  type FeeAccuracyReport,
  type FeeAccuracyReportFile,
  type FeeComparison,
  type FeeObservation,
  type FeeTolerance,
  type FeeVerdict,
} from './compare';

export {
  FEE_REPORT_PATH_ENV,
  renderFeeAccuracyMarkdown,
  resolveReportPath,
  writeFeeAccuracyReport,
  type WriteReportOptions,
} from './report';

export { evaluateGate, runGate, type GateOptions, type GateResult } from './cli';
