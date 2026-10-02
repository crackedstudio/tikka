#!/usr/bin/env node
/**
 * API compatibility gate — enforces the deprecation policy in `docs/RELEASE.md`.
 *
 * The committed API Extractor reports under `sdk/etc/*.api.md` are the canonical
 * record of the SDK's public surface. This script diffs those reports against a
 * base ref and, when any public export **disappeared**, requires that the change
 * is declared as a **major** bump:
 *
 *   - `sdk/package.json` major version increased relative to the base, or
 *   - a pending changeset (`.changeset/*.md`) declares `@tikka/sdk: major`.
 *
 * A removed export that is only announced as `minor`/`patch` fails with the list
 * of removed symbols, because `minor` is the bump that *deprecates* an export —
 * it is not a licence to remove one.
 *
 * Usage: node scripts/check-api-compat.mjs [base-ref]   (default: origin/master)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SDK_ETC_DIR = join(REPO_ROOT, 'sdk', 'etc');
const SDK_PACKAGE_JSON = join(REPO_ROOT, 'sdk', 'package.json');
const CHANGESET_DIR = join(REPO_ROOT, '.changeset');

const base = process.argv[2] || 'origin/master';

/**
 * Public export names declared in one API report.
 *
 * Matches the declaration forms API Extractor emits:
 *   `export interface X {`, `export class X extends … {`,
 *   `export function x(…): …;`, `export type X = …;`,
 *   `export declare const X: …;`, and re-export blocks `export { X, Y as Z }`.
 */
export function parseReportExports(report) {
  const names = new Set();
  const declaration =
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|class|function|type|const|let|var|enum|namespace)\s+([A-Za-z0-9_$]+)/gm;

  for (const match of report.matchAll(declaration)) {
    names.add(match[1]);
  }

  for (const block of report.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const entry of block[1].split(',')) {
      const alias = entry.split(/\s+as\s+/);
      const name = (alias[1] ?? alias[0]).trim();
      if (name) names.add(name);
    }
  }

  return names;
}

/** Highest bump declared for `@tikka/sdk` across pending changesets, if any. */
export function changesetBumpForSdk() {
  const RANK = { patch: 1, minor: 2, major: 3 };
  let highest = null;

  let files;
  try {
    files = readdirSync(CHANGESET_DIR).filter(
      (file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md',
    );
  } catch {
    return null;
  }

  for (const file of files) {
    const source = readFileSync(join(CHANGESET_DIR, file), 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) continue;

    for (const line of frontmatter[1].split(/\r?\n/)) {
      const entry = line.match(/^\s*['"]?([^'":]+)['"]?\s*:\s*(\w+)\s*$/);
      if (!entry) continue;
      const [, name, bump] = entry;
      if (name.trim().replace(/^@[^/]+\//, '') !== 'sdk') continue;
      if (!(bump in RANK)) continue;
      if (highest === null || RANK[bump] > RANK[highest]) highest = bump;
    }
  }

  return highest;
}

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function majorOf(version) {
  return Number.parseInt(String(version).split('.')[0], 10);
}

function main() {
  let baseRef = base;
  if (gitShow(baseRef, 'package.json') === null) {
    if (gitShow('origin/master', 'package.json') !== null) {
      console.warn(
        `⚠️  Base ref "${baseRef}" is not resolvable in this checkout — ` +
          'falling back to origin/master.',
      );
      baseRef = 'origin/master';
    } else {
      console.error(
        `❌ API compatibility check: base ref "${baseRef}" is not resolvable. ` +
          'Check out with full history (actions/checkout with fetch-depth: 0).',
      );
      process.exit(1);
    }
  }

  let reports;
  try {
    reports = readdirSync(SDK_ETC_DIR).filter((file) => file.endsWith('.api.md'));
  } catch {
    console.log('No sdk/etc/*.api.md reports found — nothing to compare.');
    return;
  }

  const removedByReport = [];

  for (const file of reports) {
    const relPath = `sdk/etc/${file}`;
    const baseReport = gitShow(baseRef, relPath);
    if (baseReport === null) {
      console.log(`• ${file}: new in this change, skipping.`);
      continue;
    }

    const headReport = readFileSync(join(SDK_ETC_DIR, file), 'utf8');
    const baseExports = parseReportExports(baseReport);
    const headExports = parseReportExports(headReport);
    const removed = [...baseExports].filter((name) => !headExports.has(name));

    console.log(
      `• ${basename(file)}: ${baseExports.size} → ${headExports.size} public exports` +
        (removed.length > 0 ? `, ${removed.length} removed` : ''),
    );

    if (removed.length > 0) {
      removedByReport.push({ file, removed: removed.sort() });
    }
  }

  if (removedByReport.length === 0) {
    console.log('\n✅ API compatibility check passed — no public exports removed.');
    return;
  }

  const headVersion = JSON.parse(readFileSync(SDK_PACKAGE_JSON, 'utf8')).version;
  const baseVersion = JSON.parse(
    gitShow(baseRef, 'sdk/package.json') ?? '{"version":"0.0.0"}',
  ).version;
  const majorBumped = majorOf(headVersion) > majorOf(baseVersion);
  const changesetBump = changesetBumpForSdk();

  console.log('\nRemoved public exports:');
  for (const { file, removed } of removedByReport) {
    console.log(`  ${file}:`);
    for (const name of removed) console.log(`    - ${name}`);
  }
  console.log(
    `\nsdk version: ${baseVersion} → ${headVersion} ` +
      `(major bumped: ${majorBumped ? 'yes' : 'no'})`,
  );
  console.log(`pending changeset bump for @tikka/sdk: ${changesetBump ?? 'none'}`);

  if (majorBumped || changesetBump === 'major') {
    console.log(
      '\n✅ Removals are declared as a major bump — allowed by the deprecation policy.',
    );
    return;
  }

  console.error(
    '\n❌ Removing a public export requires a MAJOR bump (see docs/RELEASE.md § Deprecation policy).\n' +
      '   A `minor` bump deprecates an export; it must survive at least one minor release\n' +
      '   before removal. Either restore the exports above, or add a changeset declaring:\n\n' +
      "     '@tikka/sdk': major\n",
  );
  process.exit(1);
}

// Only run when executed directly, so the parsing helpers stay importable.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
