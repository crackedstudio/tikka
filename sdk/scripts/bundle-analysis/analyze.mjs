#!/usr/bin/env node
/**
 * Bundles the fixture.light.ts entry with esbuild and reports what actually
 * lands in the output, so tree-shaking of the light SDK entry (issue #1108)
 * is measured rather than assumed.
 */

import { build, analyzeMetafile } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'out');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'fixture.light.bundle.js');

const result = await build({
  entryPoints: [path.join(dir, 'fixture.light.ts')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  metafile: true,
  logLevel: 'silent',
});

const bundled = readFileSync(outfile);
const gzipped = gzipSync(bundled);

console.log(`Raw bundle size:   ${bundled.length} bytes`);
console.log(`Gzipped size:      ${gzipped.length} bytes`);
console.log('');
console.log(await analyzeMetafile(result.metafile, { verbose: false }));
