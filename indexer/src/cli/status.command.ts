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
 * Minimal .env loader — called before loading the service module so that
 * DATABASE_URL etc. are available when TypeORM initialises.
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
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

export interface StatusArgs {
  jsonMode: boolean;
  watchInterval: number | null;
}

export function parseArgs(args: string[]): StatusArgs {
  let jsonMode = false;
  let watchInterval: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
      jsonMode = true;
    } else if (args[i] === '--watch' && watchInterval === null) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        watchInterval = 3000;
      } else if (/^[1-9]\d*$/.test(next) && Number.isSafeInteger(Number(next))) {
        watchInterval = Number(next);
        i++;
      } else {
        throw new Error('--watch interval must be a positive integer in milliseconds.');
      }
    } else {
      throw new Error(`Unknown status option: ${args[i]}`);
    }
  }

  return { jsonMode, watchInterval };
}

async function run(options: StatusArgs): Promise<number> {
  try {
    // Load service modules only after the env files have been read.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchStatus } = require('./status.service') as typeof import('./status.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { renderTable, renderJson } =
      require('./status-display') as typeof import('./status-display');
    const result = await fetchStatus();
    const output = options.jsonMode ? renderJson(result) : renderTable(result);

    if (options.watchInterval !== null && !options.jsonMode) {
      process.stdout.write('\x1b[2J\x1b[H');
    }
    console.log(output);

    return result.db.status === 'ok' && result.cache.status === 'ok' && result.warnings.length === 0
      ? 0
      : 1;
  } catch (error) {
    console.error('Status fetch failed:', error);
    return 1;
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  loadEnvFile('.env.local');
  loadEnvFile('.env');
  const options = parseArgs(args);

  if (options.watchInterval === null) {
    process.exitCode = await run(options);
    return;
  }

  // Watch mode reports each snapshot but stays alive for recovery.
  await run(options);
  const timer = setInterval(() => {
    void run(options);
  }, options.watchInterval);
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\nExiting watch mode.');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
