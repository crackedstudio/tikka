#!/usr/bin/env ts-node
/**
 * Tikka Indexer — status CLI
 *
 * Usage:
 *   pnpm run status
 *   pnpm run status -- --json
 *   pnpm run status -- --watch
 *   pnpm run status -- --watch 5000
 *
 * Options:
 *   --json          Output machine-readable JSON instead of the table.
 *   --watch [ms]    Refresh every <ms> milliseconds (default: 3000).
 *                   Press Ctrl-C to exit.
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Minimal .env loader — runs synchronously before any other module code
 * so that DATABASE_URL etc. are available when TypeORM initialises.
 * Does not override values already present in process.env.
 */
function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

// Load env before importing service modules so DATABASE_URL is set in time.
loadEnvFile('.env.local');
loadEnvFile('.env');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchStatus } = require('./status.service') as typeof import('./status.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderTable, renderJson } = require('./status-display') as typeof import('./status-display');

const args = process.argv.slice(2);
const jsonMode      = args.includes('--json');
const watchIdx      = args.indexOf('--watch');
const watchMode     = watchIdx !== -1;
const watchInterval = watchMode
  ? (parseInt(args[watchIdx + 1] ?? '', 10) || 3000)
  : 0;

async function run(): Promise<void> {
  const result = await fetchStatus();
  const output = jsonMode ? renderJson(result) : renderTable(result);

  if (watchMode && !jsonMode) {
    // Clear screen for a clean refresh in watch mode
    process.stdout.write('\x1b[2J\x1b[H');
  }

  console.log(output);
}

async function main(): Promise<void> {
  if (!watchMode) {
    await run();
    return;
  }

  // Watch mode: run immediately, then repeat on interval
  await run();
  const timer = setInterval(async () => {
    try {
      await run();
    } catch (err) {
      console.error('Status fetch error:', err);
    }
  }, watchInterval);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\nExiting watch mode.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
