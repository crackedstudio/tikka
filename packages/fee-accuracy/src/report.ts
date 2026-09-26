/**
 * Rendering and persistence of a {@link FeeAccuracyReport}.
 *
 * The scheduled testnet run writes both a machine-readable JSON report (uploaded
 * as a CI artifact) and a Markdown rendering (appended to the job summary), so
 * a failed accuracy run can be diagnosed without re-running it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FeeAccuracyReport, FeeTolerance } from './compare';
import { toReportFile } from './compare';
import { stroopsToXlmString } from './units';

/** Environment variable holding the JSON report path. */
export const FEE_REPORT_PATH_ENV = 'TIKKA_FEE_REPORT_PATH';

const DEFAULT_REPORT_FILE_NAME = 'fee-accuracy-report.json';

function formatStroops(value: number): string {
  return value.toLocaleString('en-US');
}

function formatTolerance(tolerance: FeeTolerance): string {
  return `±${tolerance.relativePercent}% (min ${formatStroops(tolerance.absoluteStroops)} stroops)`;
}

const VERDICT_ICONS: Record<string, string> = {
  accurate: '✅',
  'under-quoted': '🔻',
  'over-quoted': '🔺',
  invalid: '⚠️',
};

/** Renders a report as the Markdown block appended to a CI job summary. */
export function renderFeeAccuracyMarkdown(report: FeeAccuracyReport): string {
  const lines: string[] = [];
  const status = report.passed ? '✅ within tolerance' : '❌ outside tolerance';

  lines.push('## 💸 Fee Estimate Accuracy');
  lines.push('');
  lines.push(`**Result:** ${status} — ${report.summary}`);
  lines.push('');
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(`- Normal tolerance: ${formatTolerance(report.tolerance.normal)}`);
  lines.push(`- Surge tolerance: ${formatTolerance(report.tolerance.surge)}`);
  lines.push(
    `- Surge threshold: ${formatStroops(report.surgeThresholdStroops)} stroops inclusion fee (surge observed: ${
      report.surgeDetected ? 'yes' : 'no'
    })`,
  );
  lines.push('');

  if (report.comparisons.length === 0) {
    lines.push('_No fee observations were recorded._');
    return lines.join('\n');
  }

  lines.push('| Observation | Quoted | Charged | Δ stroops | Δ % | Band | Surge | Verdict |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | :---: | --- |');
  for (const comparison of report.comparisons) {
    lines.push(
      `| \`${comparison.label}\` | ${formatStroops(comparison.estimatedStroops)} | ${formatStroops(
        comparison.actualStroops,
      )} | ${comparison.deltaStroops > 0 ? '+' : ''}${formatStroops(comparison.deltaStroops)} | ${comparison.deltaPercent.toFixed(
        1,
      )}% | ±${formatStroops(comparison.allowedDeltaStroops)} | ${comparison.surge ? '🌊' : '—'} | ${
        VERDICT_ICONS[comparison.verdict] ?? '•'
      } ${comparison.verdict} |`,
    );
  }
  lines.push('');

  const details = report.comparisons
    .map((comparison) =>
      Object.entries(comparison.details ?? {}).filter(([, v]) => v !== undefined),
    )
    .filter((entries) => entries.length > 0);
  if (details.length > 0) {
    lines.push('<details><summary>Observation context</summary>');
    lines.push('');
    report.comparisons.forEach((comparison, index) => {
      const entries = details[index];
      if (entries.length === 0) return;
      lines.push(`- \`${comparison.label}\`: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    });
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (report.failures.length > 0) {
    lines.push('### Failures');
    lines.push('');
    for (const failure of report.failures) {
      lines.push(
        `- \`${failure.label}\` (quoted ${formatStroops(failure.estimatedStroops)} stroops ≈ ${stroopsToXlmString(
          failure.estimatedStroops,
        )} XLM, charged ${formatStroops(failure.actualStroops)} stroops): ${failure.reason}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Resolves the JSON report path from the environment. */
export function resolveReportPath(env: Record<string, string | undefined> = process.env): string {
  const configured = env[FEE_REPORT_PATH_ENV];
  return configured && configured.trim() !== ''
    ? path.resolve(configured)
    : path.resolve(process.cwd(), DEFAULT_REPORT_FILE_NAME);
}

/** Options accepted by {@link writeFeeAccuracyReport}. */
export interface WriteReportOptions {
  /** JSON report path; defaults to {@link resolveReportPath}. */
  jsonPath?: string;
  /** Markdown path; defaults to the JSON path with a `.md` extension. */
  markdownPath?: string;
}

/**
 * Writes the JSON and Markdown reports, creating parent directories as needed.
 *
 * @returns the paths that were written.
 */
export function writeFeeAccuracyReport(
  report: FeeAccuracyReport,
  options: WriteReportOptions = {},
): { jsonPath: string; markdownPath: string } {
  const jsonPath = options.jsonPath ?? resolveReportPath();
  const markdownPath = options.markdownPath ?? jsonPath.replace(/\.json$/i, '') + '.md';

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(toReportFile(report), null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, `${renderFeeAccuracyMarkdown(report)}\n`, 'utf8');

  return { jsonPath, markdownPath };
}
