#!/usr/bin/env node
/**
 * Ratcheting cap on `any` usage across the SDK.
 *
 * `@typescript-eslint/no-explicit-any` is reported as a warning so existing
 * debt stays visible without breaking the build. This script turns that warning
 * into a hard gate: the number of `any` occurrences is counted per top-level
 * source directory and compared against a committed budget.
 *
 * The budget only ever moves down. `pnpm lint:any-budget:update` lowers it to the
 * current count, and refuses to raise it — a new `any` has to be paid for by
 * removing an existing one, so the total can never climb again.
 *
 * Usage:
 *   node scripts/check-any-budget.mjs               # fail if the budget is exceeded
 *   node scripts/check-any-budget.mjs --update      # ratchet the budget down
 */

import { ESLint } from 'eslint';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RULE = '@typescript-eslint/no-explicit-any';
const dir = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(dir, '..');
const budgetPath = path.join(sdkRoot, 'any-budget.json');
const lintTargets = ['src/**/*.ts'];

const update = process.argv.includes('--update');
const allowIncrease = process.argv.includes('--allow-increase');

/**
 * Buckets a file under `src/<area>/` so the budget tracks directory ownership
 * rather than individual files, which keeps the report stable while files move.
 */
function areaOf(filePath) {
  const relative = path.relative(sdkRoot, filePath).split(path.sep);
  if (relative[0] !== 'src') return null;
  return relative.length > 2 ? relative[1] : 'src';
}

async function countByArea() {
  const eslint = new ESLint({
    cwd: sdkRoot,
    overrideConfigFile: path.join(sdkRoot, 'eslint.config.js'),
    // Count independently of how the rule is configured so the budget stays
    // meaningful when severity changes.
    overrideConfig: { rules: { [RULE]: 'warn' } },
  });

  const results = await eslint.lintFiles(lintTargets);
  const areas = {};

  for (const result of results) {
    const area = areaOf(result.filePath);
    if (!area) continue;
    const hits = result.messages.filter((message) => message.ruleId === RULE).length;
    if (hits > 0) areas[area] = (areas[area] ?? 0) + hits;
  }

  return areas;
}

function total(areas) {
  return Object.values(areas).reduce((sum, count) => sum + count, 0);
}

function formatAreas(areas) {
  return Object.keys(areas)
    .sort()
    .map((area) => `  ${area.padEnd(16)} ${String(areas[area]).padStart(4)}`)
    .join('\n');
}

const areas = await countByArea();
const currentTotal = total(areas);

if (!existsSync(budgetPath)) {
  console.error(`any-budget.json not found at ${path.relative(sdkRoot, budgetPath)}`);
  process.exit(1);
}

const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
const budgetAreas = budget.areas ?? {};

if (update) {
  const increases = Object.keys(areas).filter(
    (area) => (areas[area] ?? 0) > (budgetAreas[area] ?? 0),
  );
  const removed = Object.keys(budgetAreas).filter((area) => !(area in areas));

  if (increases.length > 0 && !allowIncrease) {
    console.error('Refusing to raise the `any` budget. The cap is ratcheting — only downward.');
    for (const area of increases) {
      console.error(`  ${area}: ${budgetAreas[area] ?? 0} -> ${areas[area]}`);
    }
    console.error('Remove the new `any` usages, or pass --allow-increase to override.');
    process.exit(1);
  }

  const next = {
    $comment:
      'Ratcheting cap on @typescript-eslint/no-explicit-any occurrences per src/ area. ' +
      'Regenerate with `pnpm lint:any-budget:update`; never raise an entry.',
    total: currentTotal,
    areas: Object.fromEntries(
      Object.keys(areas)
        .sort()
        .map((area) => [area, areas[area]]),
    ),
  };

  await writeFile(budgetPath, `${JSON.stringify(next, null, 2)}\n`);
  const delta = budget.total - next.total;
  console.log(
    `any budget updated: ${budget.total} -> ${next.total} (${delta >= 0 ? '-' : '+'}${Math.abs(delta)})`,
  );
  if (removed.length > 0) console.log(`  areas cleared: ${removed.join(', ')}`);
  console.log(formatAreas(areas));
  process.exit(0);
}

const overages = [];
if (currentTotal > budget.total) overages.push(['TOTAL', budget.total, currentTotal]);
for (const [area, cap] of Object.entries(budgetAreas)) {
  const actual = areas[area] ?? 0;
  if (actual > cap) overages.push([area, cap, actual]);
}

console.log(`any usage: ${currentTotal} / budget ${budget.total}`);
console.log(formatAreas(areas));

if (overages.length === 0) {
  if (currentTotal < budget.total) {
    console.log('Budget has headroom — run `pnpm lint:any-budget:update` to ratchet it down.');
  }
  process.exit(0);
}

console.error('\n`any` budget exceeded:');
for (const [area, cap, actual] of overages) {
  console.error(`  ${area}: ${actual} > ${cap} (${actual - cap} over)`);
}
console.error(
  '\nReplace the offending `any` with a concrete type or `unknown` plus a narrowing guard.',
);
console.error('If the count went down, run `pnpm lint:any-budget:update` to lower the cap.');
process.exit(1);
