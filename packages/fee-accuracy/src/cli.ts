/**
 * Fee accuracy report gate.
 *
 * Reads a report written by `writeFeeAccuracyReport` and exits non-zero when it
 * did not pass, so a scheduled testnet run fails on fee drift instead of only
 * reporting it.
 *
 *   pnpm --filter @tikka/fee-accuracy gate
 *   node packages/fee-accuracy/src/cli.ts --path sdk/fee-accuracy-report.json
 *
 * Exits:
 * - `0` — every observation stayed inside the tolerance band
 * - `1` — the report failed, carried no observations, or could not be read
 */

import fs from 'fs';
import { resolveReportPath } from './report';
import type { FeeAccuracyReportFile, FeeComparison } from './compare';

export interface GateResult {
  passed: boolean;
  /** Why the gate failed; `undefined` when it passed. */
  reason?: string;
  /** Report that was inspected, when one could be read. */
  report?: FeeAccuracyReportFile;
}

/** Arguments accepted by {@link runGate}. */
export interface GateOptions {
  /** Report path; defaults to {@link resolveReportPath}. */
  path?: string;
}

/**
 * Applies the pass/fail decision for a report.
 *
 * A report with no observations is a failure: an empty report means the suite
 * never measured anything, which must not be mistaken for a clean run.
 */
export function evaluateGate(report: FeeAccuracyReportFile | null): GateResult {
  if (!report) {
    return { passed: false, reason: 'No fee accuracy report was found.' };
  }

  const comparisons: FeeComparison[] = Array.isArray(report.comparisons) ? report.comparisons : [];
  if (comparisons.length === 0) {
    return { passed: false, reason: 'The report contains no fee observations.', report };
  }

  if (report.passed) {
    return { passed: true, report };
  }

  const failures: FeeComparison[] = Array.isArray(report.failures) ? report.failures : [];
  const detail = failures.map((failure) => `  - ${failure.label}: ${failure.reason}`).join('\n');

  return {
    passed: false,
    reason: `${failures.length || report.comparisons.length} fee observation(s) outside tolerance:\n${detail}`,
    report,
  };
}

/** Reads the report from disk and applies the gate decision. */
export function runGate(options: GateOptions = {}): GateResult {
  const reportPath = options.path ?? resolveReportPath();

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return { passed: false, reason: `Could not read the fee accuracy report at ${reportPath}.` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { passed: false, reason: `The fee accuracy report at ${reportPath} is not an object.` };
  }

  return evaluateGate(parsed as FeeAccuracyReportFile);
}

/**
 * Entry point: applies the gate and maps it onto a process exit code.
 *
 * @param argv - arguments after the script name; `--path <file>` selects the
 * report, otherwise {@link resolveReportPath} is used.
 * @returns `0` when the report passed, `1` otherwise.
 */
export function runCli(argv: string[]): number {
  const pathFlag = argv.indexOf('--path');
  const reportPath = pathFlag >= 0 ? argv[pathFlag + 1] : undefined;
  const result = runGate(reportPath ? { path: reportPath } : {});

  if (result.passed) {
    process.stdout.write(
      `Fee accuracy passed: ${result.report?.comparisons.length ?? 0} observation(s) inside tolerance.\n`,
    );
    return 0;
  }

  process.stderr.write(`Fee accuracy FAILED: ${result.reason}\n`);
  return 1;
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}
