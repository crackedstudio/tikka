import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Deprecation policy guard.
 *
 * `docs/RELEASE.md` § Deprecation policy promises that an export marked
 * `@deprecated` **keeps working** until a major release removes it. The
 * companion CI check (`scripts/check-api-compat.mjs`) enforces the *removal*
 * half — a deleted public export must be a major bump. This spec enforces the
 * *survival* half: every `@deprecated` export in `src/` must still be public,
 * and every value export must still be resolvable at runtime. A deprecation
 * silently turning into a breakage fails here.
 *
 * See `sdk/DEPRECATION.md` for the policy and `etc/*.api.md` for the reports.
 */

const SRC_ROOT = __dirname;
const ETC_DIR = join(SRC_ROOT, '..', 'etc');

/** `sdk/src/testing` and friends are published; every non-spec source counts. */
const IGNORED_DIRS = new Set(['node_modules', 'coverage']);

interface DeprecatedExport {
  /** Path relative to `sdk/src`. */
  file: string;
  name: string;
  kind: 'value' | 'type';
}

const DOC_TAG = /@deprecated\b/;
const EXPORT_DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(interface|type|class|function|const|let|var|enum)\s+([A-Za-z0-9_$]+)/;
const COMMENT_OR_BLANK = /^\s*(\/\/|\/\*|\*|$)/;

/**
 * Finds `@deprecated`-annotated exports in one source file.
 *
 * Heuristic, deliberately: a `@deprecated` tag arms the scan, and the *next*
 * `export …` declaration claims it — provided only comments and blank lines
 * appear in between (the tag and its declaration are one doc block). Any other
 * statement disarms the scan, so a deprecated private helper cannot mark an
 * unrelated later export as deprecated.
 */
export function findDeprecatedExports(
  source: string,
): Array<{ name: string; kind: 'value' | 'type' }> {
  const found: Array<{ name: string; kind: 'value' | 'type' }> = [];
  let armed = false;

  for (const line of source.split(/\r?\n/)) {
    if (DOC_TAG.test(line)) {
      armed = true;
      continue;
    }

    const declaration = line.match(EXPORT_DECLARATION);
    if (declaration) {
      if (armed) {
        const [, keyword, name] = declaration;
        found.push({
          name,
          kind: keyword === 'interface' || keyword === 'type' ? 'type' : 'value',
        });
      }
      armed = false;
      continue;
    }

    if (!COMMENT_OR_BLANK.test(line)) {
      armed = false;
    }
  }

  return found;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Public export names across every committed API report. */
function reportExportNames(): Set<string> {
  const names = new Set<string>();
  const declaration =
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|class|function|type|const|let|var|enum|namespace)\s+([A-Za-z0-9_$]+)/gm;

  for (const file of readdirSync(ETC_DIR)) {
    if (!file.endsWith('.api.md')) continue;
    const report = readFileSync(join(ETC_DIR, file), 'utf8');
    for (const match of report.matchAll(declaration)) {
      names.add(match[1]);
    }
  }

  return names;
}

const sourceFiles = walk(SRC_ROOT);
const deprecated: DeprecatedExport[] = sourceFiles.flatMap((full) =>
  findDeprecatedExports(readFileSync(full, 'utf8')).map((entry) => ({
    file: relative(SRC_ROOT, full),
    ...entry,
  })),
);

describe('deprecated exports', () => {
  // Guards the scanner itself: without this, a broken walker or regex would let
  // the suite pass vacuously.
  it('scans the source tree and finds only annotated declarations', () => {
    expect(sourceFiles.length).toBeGreaterThan(50);

    const fixture = [
      '/**',
      ' * @deprecated Use `newThing` instead.',
      ' */',
      'export function oldThing(): void {}',
      '',
      '// @deprecated Use `NewShape` instead.',
      'export interface OldShape {',
      '  value: string;',
      '}',
      '',
      'export const notDeprecated = 1;',
    ].join('\n');

    expect(findDeprecatedExports(fixture)).toEqual([
      { name: 'oldThing', kind: 'value' },
      { name: 'OldShape', kind: 'type' },
    ]);
  });

  it('does not let a deprecated private helper mark a later export', () => {
    const fixture = [
      '/** @deprecated internal helper */',
      'function helper(): void {}',
      'const unrelated = 1;',
      'export const publicThing = 2;',
    ].join('\n');

    expect(findDeprecatedExports(fixture)).toEqual([]);
  });

  it('keeps every @deprecated export public', () => {
    const publicNames = reportExportNames();
    const missing = deprecated.filter((entry) => !publicNames.has(entry.name));

    expect(missing).toEqual([]);
  });

  it('keeps every @deprecated value export resolvable at runtime', () => {
    const unresolvable: string[] = [];

    for (const entry of deprecated) {
      if (entry.kind !== 'value') continue;
      const moduleExports = jest.requireActual<Record<string, unknown>>(
        join(SRC_ROOT, entry.file),
      );
      if (moduleExports[entry.name] === undefined) {
        unresolvable.push(`${entry.file}: ${entry.name}`);
      }
    }

    expect(unresolvable).toEqual([]);
  });
});
