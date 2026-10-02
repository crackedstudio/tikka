#!/usr/bin/env node
/**
 * Renders `pnpm size-check --json` output as a Markdown table on the CI step
 * summary, so the SDK job always publishes the current bundle numbers (issue
 * #1556).
 *
 * Usage: node scripts/bundle-analysis/report-size-budgets.mjs [size-summary.json]
 *
 * Reporting only — this script never fails the job. Budget failures come from
 * `size-limit`'s own exit code, which the caller preserves.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// `pnpm run <script> -- <args>` forwards the `--` separator itself, so it is
// dropped before picking the input file.
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const input = args[0] ?? 'size-summary.json';

function human(bytes) {
  if (bytes == null) return 'N/A';
  if (Math.abs(bytes) >= 1000) return `${(bytes / 1000).toFixed(2)} kB`;
  return `${bytes} B`;
}

function statusIcon(check) {
  if (typeof check.passed === 'boolean') return check.passed ? '✅' : '❌';
  return '⚠️';
}

function formatTable(checks) {
  const lines = [
    '| Entry | Size (gzip, minified) | Budget | Status |',
    '| --- | ---: | ---: | :---: |',
  ];
  for (const check of checks) {
    const size = check.size ?? check.gzipSize ?? null;
    const limit = check.sizeLimit ?? check.limit ?? null;
    lines.push(
      `| \`${check.name}\` | ${human(size)} | ${human(limit)} | ${statusIcon(check)} |`
    );
  }
  return lines;
}

function emit(markdown) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(summary, `${markdown}\n`);
  }
  console.log(markdown);
}

if (!existsSync(input)) {
  emit(
    [
      '### SDK bundle size budgets',
      '',
      `⚠️ \`${input}\` was not produced — \`pnpm size-check\` did not run to completion.`,
      'Run `pnpm run size-check` locally (after `pnpm run build`) to regenerate the numbers.',
    ].join('\n')
  );
  process.exit(0);
}

// `pnpm` prints engine/version notices on stdout before `size-limit`'s own
// JSON, so the payload is located rather than assuming the file is pure JSON.
function parseChecks(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines.slice(i).join('\n').trim();
    if (!candidate.startsWith('[') && !candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // keep scanning — earlier lines belong to the package manager banner
    }
  }
  return null;
}

const checks = parseChecks(readFileSync(input, 'utf8'));

if (!checks) {
  emit(
    [
      '### SDK bundle size budgets',
      '',
      `⚠️ Could not parse size-limit results from \`${path.basename(input)}\`.`,
    ].join('\n')
  );
  process.exit(0);
}

if (checks.length === 0) {
  emit(['### SDK bundle size budgets', '', '⚠️ No size-limit results found.'].join('\n'));
  process.exit(0);
}

const failed = checks.filter((check) => check.passed === false);
const rows = formatTable(checks);

emit(
  [
    '### SDK bundle size budgets',
    '',
    ...rows,
    '',
    failed.length > 0
      ? `**${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} over budget:** ${failed
          .map((check) => `\`${check.name}\``)
          .join(', ')}`
      : 'All entries are within budget.',
    '',
    '_Baseline recorded in `docs/performance/sdk-bundle-size.md`. `size-limit` measures_',
    '_the minified + gzipped bundle including dependencies (except `ignore`d externals)._',
  ].join('\n')
);
