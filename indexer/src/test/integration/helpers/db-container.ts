/**
 * db-container.ts
 *
 * Spins up a temporary PostgreSQL container via Testcontainers, creates a
 * TypeORM DataSource connected to it, and runs all indexer migrations so
 * integration tests start with a clean, fully-migrated schema.
 *
 * Usage pattern:
 *   let ctx: DbContainerContext;
 *   beforeAll(async () => { ctx = await startDb(); }, CONTAINER_STARTUP_MS);
 *   afterAll(async () => { await stopDb(ctx); });
 */

import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

// Entity and migration imports
import { RaffleEntity } from '../../../database/entities/raffle.entity';
import { TicketEntity } from '../../../database/entities/ticket.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { RaffleEventEntity } from '../../../database/entities/raffle-event.entity';
import { PlatformStatEntity } from '../../../database/entities/platform-stat.entity';
import { PlatformStateEntity } from '../../../database/entities/platform-state.entity';
import { IndexerCursorEntity } from '../../../database/entities/indexer-cursor.entity';
import { WebhookEntity } from '../../../database/entities/webhook.entity';
import { ArchiveCheckpointEntity } from '../../../database/entities/archive-checkpoint.entity';

import { CreateRaffles1700000000000 } from '../../../database/migrations/1700000000000-CreateRaffles';
import { CreateTickets1700000000001 } from '../../../database/migrations/1700000000001-CreateTickets';
import { CreateUsers1700000000002 } from '../../../database/migrations/1700000000002-CreateUsers';
import { CreateRaffleEvents1700000000003 } from '../../../database/migrations/1700000000003-CreateRaffleEvents';
import { CreatePlatformStats1700000000004 } from '../../../database/migrations/1700000000004-CreatePlatformStats';
import { CreateIndexerCursor1700000000005 } from '../../../database/migrations/1700000000005-CreateIndexerCursor';
import { CreatePlatformState1700000000006 } from '../../../database/migrations/1700000000006-CreatePlatformState';
import { AddWebhooksTable1720000000000 } from '../../../database/migrations/1720000000000-AddWebhooksTable';
import { AddUserLastTxHash1720000000001 } from '../../../database/migrations/1720000000001-AddUserLastTxHash';
import { AddLedgerHashesToCursor1730000000001 } from '../../../database/migrations/1730000000001-AddLedgerHashesToCursor';
import { AddCheckpointIntegrityColumns1748736000000 } from '../../../database/migrations/1748736000000-AddCheckpointIntegrityColumns';
import { AddArchiveCheckpointIntegrityFields1748900000000 } from '../../../database/migrations/1748900000000-AddArchiveCheckpointIntegrityFields';

/** How long to wait for the container to be ready (ms). */
export const CONTAINER_STARTUP_MS = 120_000;

export interface DbContainerContext {
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
}

/**
 * Starts a fresh PostgreSQL container and returns a connected, migrated
 * DataSource. Call `stopDb(ctx)` in `afterAll`.
 */
export async function startDb(): Promise<DbContainerContext> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tikka_test')
    .withUsername('tikka')
    .withPassword('tikka_test')
    .start();

  const dataSource = await buildDataSource(container).initialize();

  // Run all migrations to bring the schema to current state
  await dataSource.runMigrations({ transaction: 'each' });

  return { container, dataSource };
}

/**
 * Destroys the DataSource connection and stops the container.
 * Should be called in `afterAll` to free resources.
 */
export async function stopDb(ctx: DbContainerContext): Promise<void> {
  await ctx.dataSource.destroy();
  await ctx.container.stop();
}

/**
 * Builds (but does not initialize) a DataSource pointed at the given container.
 * Useful for simulating crash-recovery: destroy and re-create without restarting
 * the container.
 */
export function buildDataSource(container: StartedPostgreSqlContainer): DataSource {
  const opts: DataSourceOptions = {
    type: 'postgres',
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [
      RaffleEntity,
      TicketEntity,
      UserEntity,
      RaffleEventEntity,
      PlatformStatEntity,
      PlatformStateEntity,
      IndexerCursorEntity,
      WebhookEntity,
      ArchiveCheckpointEntity,
    ],
    migrations: [
      CreateRaffles1700000000000,
      CreateTickets1700000000001,
      CreateUsers1700000000002,
      CreateRaffleEvents1700000000003,
      CreatePlatformStats1700000000004,
      CreateIndexerCursor1700000000005,
      CreatePlatformState1700000000006,
      AddWebhooksTable1720000000000,
      AddUserLastTxHash1720000000001,
      AddLedgerHashesToCursor1730000000001,
      AddCheckpointIntegrityColumns1748736000000,
      AddArchiveCheckpointIntegrityFields1748900000000,
    ],
    migrationsRun: false,
    synchronize: false,
    logging: false,
  };

  return new DataSource(opts);
}
