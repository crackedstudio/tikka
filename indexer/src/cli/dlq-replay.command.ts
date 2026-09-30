#!/usr/bin/env ts-node
/**
 * Tikka Indexer — DLQ replay CLI (issue #1597)
 *
 * Usage:
 *   pnpm run dlq:replay -- --all
 *   pnpm run dlq:replay -- --dry-run --all
 *   pnpm run dlq:replay -- --type TicketPurchased --since 2026-07-01
 *   pnpm run dlq:replay -- --dry-run --type TicketPurchased --since 2026-07-01
 *
 * Options:
 *   --all              Replay every eligible entry. Required when no other
 *                      filter is provided, so the entire DLQ cannot be
 *                      triggered by a mistyped flag.
 *   --dry-run          Summarise what would be replayed. Performs no writes.
 *   --type <a,b>       Restrict to these event types (repeatable, or comma-separated).
 *   --since <date>     Only entries created at or after this ISO date.
 *   --until <date>     Only entries created at or before this ISO date.
 *
 * Filters apply in both modes, so a dry-run reports exactly the population a
 * real replay would touch (issue #1109).
 */

import * as path from 'path';
import * as fs from 'fs';

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

loadEnvFile('.env.local');
loadEnvFile('.env');

import { DataSource, DataSourceOptions } from 'typeorm';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { IngestionDispatcherService } from '../ingestor/ingestion-dispatcher.service';
import { MAX_RETRIES } from '../ingestor/dlq.service';

import {
  parseArgs,
  applyFilters,
  requireFilterOrAll,
  summarise,
  formatSummary,
  ArgumentError,
} from './dlq-replay.filters';
import { DlqReplayService } from './dlq-replay.service';

// ---------------------------------------------------------------------------
// Argument parsing (runs synchronously before any I/O)
// ---------------------------------------------------------------------------

let parsedArgs;
try {
  parsedArgs = parseArgs(process.argv.slice(2));
} catch (err) {
  if (err instanceof ArgumentError) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  throw err;
}

// Unknown flags abort rather than being ignored. A mistyped `--dry-runn`
// falling through to a real replay is exactly what this flag exists to prevent.
if (parsedArgs.unknown.length > 0) {
  console.error(`Error: unknown option(s): ${parsedArgs.unknown.join(', ')}`);
  process.exit(2);
}

// Safety guard: refuse to run without a filter or --all.
// Checked here (before opening a DB connection) so the error message is
// immediate and no teardown is needed.
try {
  requireFilterOrAll(parsedArgs);
} catch (err) {
  if (err instanceof ArgumentError) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  throw err;
}

const { dryRun, all, filters } = parsedArgs;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const ssl =
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  const options: DataSourceOptions = {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'tikka_indexer',
    ssl,
    entities: [DeadLetterEventEntity],
    synchronize: false,
    logging: false,
  };

  const ds = new DataSource(options);
  await ds.initialize();

  try {
    const repo = ds.getRepository(DeadLetterEventEntity);

    // Dry-run path: read-only — print the summary and exit without dispatching.
    // We keep this branch in the command rather than delegating to the service
    // so we can print the per-entry detail list that operators rely on.
    if (dryRun) {
      const allEntries = await repo.find({ order: { createdAt: 'ASC' } });
      const entries = applyFilters(allEntries, filters);

      console.log(formatSummary(summarise(entries, MAX_RETRIES), filters));

      if (entries.length > 0) {
        console.log('\nEntries:');
        for (const e of entries) {
          const exhausted = e.retryCount >= MAX_RETRIES;
          console.log(
            `  [${exhausted ? 'EXHAUSTED' : 'PENDING '}] id=${e.id} type=${e.eventType} ledger=${e.ledger} retries=${e.retryCount}/${MAX_RETRIES} error="${e.errorMessage}"`,
          );
        }
      }

      console.log('\n--dry-run: nothing was replayed and no rows were modified.');
      return;
    }

    // Real replay: delegate to DlqReplayService which owns the dispatch loop.
    // The dispatcher service is constructed with null optional deps because the
    // CLI does not need the pipeline state machine or tracing.
    const dispatcher = new IngestionDispatcherService(
      ds,
      null as any, // RaffleProcessor — unused during raw dispatch from DLQ payload
      null as any, // TicketProcessor
      null as any, // AdminProcessor
    );
    const service = new DlqReplayService(repo, dispatcher);

    const result = await service.replay({ filters, all, dryRun: false });

    console.log(result.summary);
    console.log(
      `\nReplay complete: replayed=${result.replayed} failed=${result.failed}` +
        ` skipped_already_replayed=${result.skippedAlreadyReplayed}` +
        ` skipped_exhausted=${result.skippedExhausted}`,
    );

    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
