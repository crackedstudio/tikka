#!/usr/bin/env ts-node
/**
 * CI-runnable migration rollback check for the indexer.
 *
 * Usage:
 *   # Against Testcontainers (default when DATABASE_URL is unset):
 *   npm run migration:rollback-check
 *
 *   # Against an existing scratch database:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/tikka_scratch \
 *     ROLLBACK_COUNT=5 npm run migration:rollback-check
 *
 * Exit code 0 on success; non-zero if any up/down fails.
 */
import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

import { CreateRaffles1700000000000 } from '../src/database/migrations/1700000000000-CreateRaffles';
import { CreateTickets1700000000001 } from '../src/database/migrations/1700000000001-CreateTickets';
import { CreateUsers1700000000002 } from '../src/database/migrations/1700000000002-CreateUsers';
import { CreateRaffleEvents1700000000003 } from '../src/database/migrations/1700000000003-CreateRaffleEvents';
import { CreatePlatformStats1700000000004 } from '../src/database/migrations/1700000000004-CreatePlatformStats';
import { CreateIndexerCursor1700000000005 } from '../src/database/migrations/1700000000005-CreateIndexerCursor';
import { CreatePlatformState1700000000006 } from '../src/database/migrations/1700000000006-CreatePlatformState';
import { AddWebhooksTable1720000000000 } from '../src/database/migrations/1720000000000-AddWebhooksTable';
import { AddUserLastTxHash1720000000001 } from '../src/database/migrations/1720000000001-AddUserLastTxHash';
import { AddWinningTicketId1720000000002 } from '../src/database/migrations/1720000000002-AddWinningTicketId';
import { AddSchemaVersionToRaffleEvents1720000000003 } from '../src/database/migrations/1720000000003-AddSchemaVersionToRaffleEvents';
import { CreateDeadLetterEvents1730000000000 } from '../src/database/migrations/1730000000000-CreateDeadLetterEvents';
import { AddLedgerHashesToCursor1730000000001 } from '../src/database/migrations/1730000000001-AddLedgerHashesToCursor';
import { CreateArchiveCheckpoints1748589373000 } from '../src/database/migrations/1748589373000-CreateArchiveCheckpoints';
import { AddCheckpointIntegrityColumns1748736000000 } from '../src/database/migrations/1748736000000-AddCheckpointIntegrityColumns';
import { AddArchiveCheckpointIntegrityFields1748900000000 } from '../src/database/migrations/1748900000000-AddArchiveCheckpointIntegrityFields';
import { AddRaffleEventIndexes1750000000000 } from '../src/database/migrations/1750000000000-AddRaffleEventIndexes';
import { BackfillSchemaVersions1750000000001 } from '../src/database/migrations/1750000000001-BackfillSchemaVersions';
import { CreateWebhookDeliveries1760000000000 } from '../src/database/migrations/1760000000000-CreateWebhookDeliveries';

const ALL_MIGRATIONS = [
  CreateRaffles1700000000000,
  CreateTickets1700000000001,
  CreateUsers1700000000002,
  CreateRaffleEvents1700000000003,
  CreatePlatformStats1700000000004,
  CreateIndexerCursor1700000000005,
  CreatePlatformState1700000000006,
  AddWebhooksTable1720000000000,
  AddUserLastTxHash1720000000001,
  AddWinningTicketId1720000000002,
  AddSchemaVersionToRaffleEvents1720000000003,
  CreateDeadLetterEvents1730000000000,
  AddLedgerHashesToCursor1730000000001,
  CreateArchiveCheckpoints1748589373000,
  AddCheckpointIntegrityColumns1748736000000,
  AddArchiveCheckpointIntegrityFields1748900000000,
  AddRaffleEventIndexes1750000000000,
  BackfillSchemaVersions1750000000001,
  CreateWebhookDeliveries1760000000000,
];

const ROLLBACK_COUNT = Math.min(
  parseInt(process.env.ROLLBACK_COUNT ?? '5', 10) || 5,
  ALL_MIGRATIONS.length,
);

function dataSourceFromUrl(url: string): DataSource {
  const opts: DataSourceOptions = {
    type: 'postgres',
    url,
    entities: [],
    migrations: ALL_MIGRATIONS,
    migrationsRun: false,
    synchronize: false,
    logging: false,
  };
  return new DataSource(opts);
}

async function runCycle(ds: DataSource): Promise<void> {
  console.log(`Running all ${ALL_MIGRATIONS.length} migrations (up)...`);
  await ds.runMigrations({ transaction: 'each' });

  console.log(`Reverting last ${ROLLBACK_COUNT} migration(s) (down)...`);
  for (let i = 0; i < ROLLBACK_COUNT; i++) {
    await ds.undoLastMigration({ transaction: 'each' });
  }

  console.log('Re-applying reverted migrations (up)...');
  await ds.runMigrations({ transaction: 'each' });

  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM migrations ORDER BY id ASC`,
  );
  if (rows.length !== ALL_MIGRATIONS.length) {
    throw new Error(
      `Expected ${ALL_MIGRATIONS.length} migrations after cycle, got ${rows.length}`,
    );
  }
  console.log('Migration rollback check passed (up → down → up).');
}

async function main(): Promise<void> {
  if (process.env.DATABASE_URL) {
    const ds = await dataSourceFromUrl(process.env.DATABASE_URL).initialize();
    try {
      await runCycle(ds);
    } finally {
      await ds.destroy();
    }
    return;
  }

  console.log('DATABASE_URL unset — starting scratch Postgres via Testcontainers...');
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tikka_rollback')
    .withUsername('tikka')
    .withPassword('tikka_test')
    .start();

  const ds = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [],
    migrations: ALL_MIGRATIONS,
    migrationsRun: false,
    synchronize: false,
    logging: false,
  });

  await ds.initialize();
  try {
    await runCycle(ds);
  } finally {
    await ds.destroy();
    await container.stop();
  }
}

main().catch((err) => {
  console.error('Migration rollback check failed:', err);
  process.exit(1);
});
