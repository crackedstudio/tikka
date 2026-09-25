#!/usr/bin/env ts-node
/**
 * Tikka Indexer — status CLI
 *
 * Usage:
 *   pnpm run status
 *   pnpm run status -- --json
 *   pnpm run status -- --watch
 *   pnpm run status -- --watch 5000
 *   pnpm run status -- --json --watch 10000
 *
 * Options:
 *   --json          Emit machine-readable JSON (StatusResult) to stdout instead
 *                   of the ANSI table.  Useful for runbooks and scripted checks:
 *
 *                     pnpm run status -- --json | jq '.db.status'
 *                     pnpm run status -- --json | jq '.indexer.lag_ledgers'
 *
 *                   The JSON shape is stable — key fields:
 *                     .timestamp                 ISO-8601 wall time of the snapshot
 *                     .indexer.current_ledger    last ledger committed to the DB
 *                     .indexer.horizon_ledger    latest ledger seen by Horizon
 *                     .indexer.lag_ledgers       horizon − current  (null if unknown)
 *                     .indexer.mode              RUNNING | DEGRADED | STOPPED | null
 *                     .indexer.checkpoint        last persisted checkpoint (or null)
 *                     .events.total_processed    cumulative count of indexed events
 *                     .events.last_24h           events indexed in the last 24 hours
 *                     .events.last_processed_at  ISO-8601 timestamp of last event
 *                     .dlq.total                 dead-letter queue depth
 *                     .cache.status              "ok" | "error"
 *                     .cache.latency_ms          Redis round-trip time in ms
 *                     .db.status                 "ok" | "error"
 *                     .db.pool                   { total, idle, waiting } or null
 *                     .warnings                  string[] of actionable alerts
 *
 *   --watch [ms]    Refresh every <ms> milliseconds (default: 3000).
 *                   Press Ctrl-C to exit.  Combine with --json for streaming
 *                   snapshots to a log aggregator.
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
