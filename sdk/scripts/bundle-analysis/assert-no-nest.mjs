#!/usr/bin/env node
/**
 * Regression guard for the light entry point (issue #1556).
 *
 * `@tikka/sdk/light` exists to give browser consumers a small runtime. The
 * failure this script catches is an import creeping into `src/index.light.ts`
 * that drags the NestJS runtime (`@nestjs/common`, `@nestjs/core`, ...) back
 * in — something a byte budget alone can absorb for a while before it trips.
 *
 * The light bundle is rebuilt with esbuild (same settings as `analyze.mjs`)
 * and the resulting module graph is inspected. The check fails when:
 *
 *   1. any `node_modules/@nestjs/*` module was loaded for the light entry, or
 *   2. the emitted bundle still contains a `@nestjs/` reference.
 *
 * Run with `pnpm run build:light && pnpm run bundle:assert-light`.
 */

import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(dir, '..', '..');
const entryPoint = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(sdkRoot, 'dist', 'light', 'index.light.js');
const outDir = path.join(dir, 'out');
const outfile = path.join(outDir, 'light.assert.bundle.js');

if (!existsSync(entryPoint)) {
  console.error(
    `Light bundle entry not found at ${path.relative(process.cwd(), entryPoint)}.\n` +
      'Run `pnpm run build:light` first.'
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

let result;
try {
  result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    // Only the module graph matters here, so Node builtins are left external
    // instead of failing the build when a browser-targeted dependency reaches
    // for `stream`/`crypto`.
    external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    outfile,
    metafile: true,
    logLevel: 'silent',
  });
} catch (error) {
  console.error('❌ Could not bundle the light entry point.\n');
  for (const detail of error.errors ?? []) {
    console.error(`  ${detail.text}`);
    for (const location of detail.location ? [detail.location] : []) {
      console.error(`    at ${location.file}:${location.line}:${location.column}`);
    }
  }
  process.exit(1);
}

const nestModules = Object.keys(result.metafile.inputs)
  .filter((file) => /node_modules\/@nestjs\//.test(file))
  .sort();

const bundle = readFileSync(outfile, 'utf8');
const leakedReference = bundle.includes('@nestjs/');

const problems = [];
if (nestModules.length > 0) {
  problems.push(`${nestModules.length} @nestjs/* module(s) pulled into the light bundle:`);
  for (const file of nestModules.slice(0, 20)) {
    problems.push(`  - ${file}`);
  }
}
if (leakedReference) {
  problems.push('The emitted light bundle contains a "@nestjs/" reference.');
}

if (problems.length > 0) {
  console.error('❌ Light bundle must not contain @nestjs/* code.\n');
  for (const line of problems) console.error(line);
  console.error(
    '\nRemove the Nest import from src/index.light.ts (or the module it reaches),' +
      '\nor move that export behind the main entry point.'
  );
  process.exit(1);
}

const bytes = Buffer.byteLength(bundle);
console.log('✅ Light bundle contains no @nestjs/* code.');
console.log(`   entry:     dist/light/index.light.js`);
console.log(`   modules:   ${Object.keys(result.metafile.inputs).length}`);
console.log(`   raw size:  ${bytes} bytes`);
