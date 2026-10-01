#!/usr/bin/env node
/** Bundle the complete light SDK entry and reject NestJS runtime dependencies. */

import { build, analyzeMetafile } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, 'out');
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, 'index.light.bundle.js');

const result = await build({
  entryPoints: [path.resolve(dir, '../../src/index.light.ts')],
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
const nestInputs = Object.keys(result.metafile.inputs).filter((input) =>
  /(?:^|[/\\])@nestjs(?:\+[^/]+)?(?:[/\\]|@)/.test(input),
);

if (nestInputs.length > 0) {
  console.error('Light SDK bundle unexpectedly includes NestJS code:');
  console.error(nestInputs.join('\n'));
  process.exitCode = 1;
}

console.log(`Raw bundle size:   ${bundled.length} bytes`);
console.log(`Gzipped size:      ${gzipped.length} bytes`);
console.log('');
console.log(await analyzeMetafile(result.metafile, { verbose: false }));
