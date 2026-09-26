#!/usr/bin/env node
/**
 * Packaging gate for `@tikka/sdk`.
 *
 * `npm pack --dry-run` is the only reliable way to see what a consumer
 * actually receives: it applies `files`, `.npmignore`/.gitignore fallbacks and
 * npm's always-included entries. This script runs it, then fails when the
 * tarball would contain anything that is not an intended artifact.
 *
 * Intended contents (see `files` in package.json):
 *   - `dist/**`  compiled output, including `dist/testing/**`
 *   - `bin/**`   the `tikka` CLI
 *   - the package metadata / docs listed below
 *
 * Everything else — TypeScript sources under `src/`, `examples/`, spec files,
 * tsconfigs, CI config — must not ship. Run with `pnpm run pack:check`.
 */
import { execFileSync } from 'node:child_process';

const ALWAYS_ALLOWED = new Set([
  'package.json',
  'README.md',
  'DEPRECATION.md',
  'OPERATIONAL.md',
  'LICENSE',
  'LICENSE.md',
]);

const ALLOWED_PREFIXES = ['dist/', 'bin/'];

const REQUIRED = ['package.json', 'README.md', 'bin/tikka.cjs'];

/**
 * Checked separately: the build must actually ship compiled output. Without
 * `files` in package.json, npm falls back to `.gitignore` — which ignores
 * `/dist` — so a green build could still publish a package containing no code.
 */
const DIST_PREFIX = 'dist/';

/** Warn-only: the `@tikka/sdk/testing` entry point should be in the build. */
const TESTING_ENTRY = 'dist/testing/index.js';

/** Path fragments that must never appear in the published tarball. */
const FORBIDDEN = [
  { fragment: '/src/', why: 'TypeScript sources must not ship (only dist/ does)' },
  { fragment: 'examples/', why: 'examples/ is repo-only, not a published artifact' },
  { fragment: '.spec.', why: 'spec files must not ship' },
  { fragment: 'tsconfig', why: 'build config must not ship' },
  { fragment: 'jest.config', why: 'test config must not ship' },
  { fragment: 'node_modules/', why: 'dependencies must not be bundled' },
];

/**
 * `npm pack --json` prints the manifest as a JSON array, but npm notices can
 * interleave on some versions — slice from the first `[` to the last `]`.
 */
function packManifest() {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse \`npm pack --dry-run --json\` output:\n${stdout}`);
  }
  const [entry] = JSON.parse(stdout.slice(start, end + 1));
  if (!entry?.files) {
    throw new Error('`npm pack --json` returned no file list.');
  }
  return entry;
}

function isIntended(path) {
  if (ALWAYS_ALLOWED.has(path)) return true;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function main() {
  const entry = packManifest();
  const files = entry.files.map((file) => file.path);

  const unexpected = files.filter((path) => !isIntended(path));
  const forbidden = files.flatMap((path) =>
    FORBIDDEN.filter((rule) => path.includes(rule.fragment)).map((rule) => ({
      path,
      why: rule.why,
    })),
  );
  const missing = REQUIRED.filter((path) => !files.includes(path));
  const distFiles = files.filter((path) => path.startsWith(DIST_PREFIX));
  if (distFiles.length === 0) {
    missing.push(`${DIST_PREFIX}** (compiled output)`);
  }
  if (!distFiles.includes(TESTING_ENTRY)) {
    console.warn(
      `⚠️  ${TESTING_ENTRY} is not in the build output — the ` +
        '`@tikka/sdk/testing` sub-path export will not resolve for consumers.',
    );
  }

  const sizeKb = (entry.size / 1024).toFixed(1);
  console.log(
    `tarball: ${entry.filename} — ${files.length} files, ${sizeKb} kB unpacked size`,
  );
  for (const file of files.slice(0, 25)) {
    console.log(`  ${file}`);
  }
  if (files.length > 25) {
    console.log(`  … ${files.length - 25} more`);
  }

  const problems = [];

  if (unexpected.length > 0) {
    problems.push(
      `Unexpected files in the published tarball (add to \`files\` or remove):\n` +
        unexpected.map((path) => `  - ${path}`).join('\n'),
    );
  }
  if (forbidden.length > 0) {
    problems.push(
      `Forbidden files in the published tarball:\n` +
        forbidden.map(({ path, why }) => `  - ${path} (${why})`).join('\n'),
    );
  }
  if (missing.length > 0) {
    problems.push(
      `Required artifacts missing from the published tarball:\n` +
        missing.map((path) => `  - ${path}`).join('\n'),
    );
  }

  if (problems.length > 0) {
    console.error('\n❌ SDK packaging check failed:\n');
    console.error(problems.join('\n\n'));
    console.error(
      '\nThe published tarball must contain only `dist/`, `bin/` and the ' +
        'documented metadata files. See `files` in sdk/package.json.',
    );
    process.exit(1);
  }

  console.log('\n✅ SDK packaging check passed — only intended artifacts ship.');
}

main();
