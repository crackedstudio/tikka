#!/usr/bin/env ts-node
/**
 * Tikka Indexer — DLQ replay CLI
 *
 * Usage:
 *   pnpm run dlq:replay
 *   pnpm run dlq:replay -- --dry-run
 *
 * Options:
 *   --dry-run   Print DLQ entries without replaying them.
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

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
  const entries = await repo.find({ order: { createdAt: 'ASC' } });

  if (entries.length === 0) {
    console.log('DLQ is empty.');
    await ds.destroy();
    return;
  }

  console.log(`DLQ contains ${entries.length} entries:\n`);
  for (const e of entries) {
    const exhausted = e.retryCount >= MAX_RETRIES;
    console.log(
      `  [${exhausted ? 'EXHAUSTED' : 'PENDING '}] id=${e.id} type=${e.eventType} ledger=${e.ledger} retries=${e.retryCount}/${MAX_RETRIES} error="${e.errorMessage}"`,
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: no entries replayed.');
    await ds.destroy();
    return;
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
