#!/usr/bin/env ts-node
/**
 * Tikka Indexer — DLQ replay CLI
 *
 * Usage:
 *   pnpm run dlq:replay
 *   pnpm run dlq:replay -- --dry-run
 *   pnpm run dlq:replay -- --dry-run --type TicketPurchased --since 2026-07-01
 *
 * Options:
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
import { MAX_RETRIES } from '../ingestor/dlq.service';

import {
  parseArgs,
  applyFilters,
  summarise,
  formatSummary,
  ArgumentError,
} from './dlq-replay.filters';

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

const { dryRun, filters } = parsedArgs;

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

  const repo = ds.getRepository(DeadLetterEventEntity);
  const allEntries = await repo.find({ order: { createdAt: 'ASC' } });

  // Filters are applied once, to the set both modes operate on, so a dry-run
  // can never report a different population than a real replay would touch.
  const entries = applyFilters(allEntries, filters);

  if (dryRun) {
    // Returns before anything that could mutate state. The connection is
    // opened read-only in practice: the only query issued above is a find().
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
    await ds.destroy();
    return;
  }

  if (entries.length === 0) {
    console.log('No DLQ entries match the given filters.');
    await ds.destroy();
    return;
  }

  console.log(`${entries.length} matching DLQ entries:\n`);
  for (const e of entries) {
    const exhausted = e.retryCount >= MAX_RETRIES;
    console.log(
      `  [${exhausted ? 'EXHAUSTED' : 'PENDING '}] id=${e.id} type=${e.eventType} ledger=${e.ledger} retries=${e.retryCount}/${MAX_RETRIES} error="${e.errorMessage}"`,
    );
  }

  console.log(
    '\nReplay requires the full NestJS application context. ' +
    'Start the indexer and use the scheduled retry job, or remove --dry-run to see this message.\n' +
    'To trigger a replay programmatically, call DlqService.replayAll() from within the app.',
  );

  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
