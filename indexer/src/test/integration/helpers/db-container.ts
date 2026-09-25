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

// Entity imports — every entity the indexer declares must be listed here so
// TypeORM knows about the full schema for relation loading, query building,
// and migration verification.
import { RaffleEntity } from '../../../database/entities/raffle.entity';
import { TicketEntity } from '../../../database/entities/ticket.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { RaffleEventEntity } from '../../../database/entities/raffle-event.entity';
import { PlatformStatEntity } from '../../../database/entities/platform-stat.entity';
import { PlatformStateEntity } from '../../../database/entities/platform-state.entity';
import { IndexerCursorEntity } from '../../../database/entities/indexer-cursor.entity';
import { WebhookEntity } from '../../../database/entities/webhook.entity';
import { ArchiveCheckpointEntity } from '../../../database/entities/archive-checkpoint.entity';
import { DeadLetterEventEntity } from '../../../database/entities/dead-letter-event.entity';
import { WebhookDeliveryEntity } from '../../../database/entities/webhook-delivery.entity';
import { WebhookDeadLetterEntity } from '../../../database/entities/webhook-dead-letter.entity';

// Single source of truth for migration ordering — every migration the indexer
// ships is listed in chronological order in all-migrations.ts.  The list is
// deliberately kept in ONE file so adding a new migration never requires
// hunting through multiple helpers.
import { ALL_INDEXER_MIGRATIONS } from './all-migrations';

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
  // Ensure the DataSource is fully destroyed before stopping the container.
  // TypeORM's DataSource.destroy() should tear down the underlying pg pool,
  // but we explicitly call pool.terminate() as a safety net against open
  // handles that prevent Jest from exiting.
  if (ctx.dataSource?.isInitialized) {
    await ctx.dataSource.destroy();
  }

  // Access the underlying pg Pool to guarantee it is terminated, even if
  // TypeORM's destroy() path did not fully clean it up.  The `any` cast is
  // intentional: TypeORM does not expose the pool on its public API.
  try {
    const driver = (ctx.dataSource as any).driver;
    const pool = driver?.pool;
    if (pool && typeof pool.terminate === 'function') {
      await pool.terminate();
    }
  } catch {
    // Pool may already be destroyed — ignore.
  }

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
      DeadLetterEventEntity,
      WebhookDeliveryEntity,
      WebhookDeadLetterEntity,
    ],
    migrations: ALL_INDEXER_MIGRATIONS,
    migrationsRun: false,
    synchronize: false,
    logging: false,
  };

  return new DataSource(opts);
}
