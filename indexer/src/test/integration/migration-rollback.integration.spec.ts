/**
 * Migration rollback check (issue #1114).
 *
 * Runs every migration up on a scratch database, reverts the last N,
 * then re-applies them. Fails if any down()/up() is broken.
 */
import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ALL_INDEXER_MIGRATIONS,
  DEFAULT_ROLLBACK_COUNT,
} from './helpers/all-migrations';
import {
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

function buildRollbackDataSource(container: StartedPostgreSqlContainer): DataSource {
  const opts: DataSourceOptions = {
    type: 'postgres',
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [],
    migrations: ALL_INDEXER_MIGRATIONS,
    migrationsRun: false,
    synchronize: false,
    logging: false,
  };
  return new DataSource(opts);
}

async function executedMigrationNames(ds: DataSource): Promise<string[]> {
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT name FROM migrations ORDER BY id ASC`,
  );
  return rows.map((r) => r.name);
}

describe('migration rollback (up → down → up)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('tikka_rollback')
      .withUsername('tikka')
      .withPassword('tikka_test')
      .start();

    dataSource = await buildRollbackDataSource(container).initialize();
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  it(`runs all migrations, reverts the last ${DEFAULT_ROLLBACK_COUNT}, then re-applies`, async () => {
    const rollbackCount = Math.min(
      DEFAULT_ROLLBACK_COUNT,
      ALL_INDEXER_MIGRATIONS.length,
    );

    // 1) Up — full schema
    await dataSource.runMigrations({ transaction: 'each' });
    const afterUp = await executedMigrationNames(dataSource);
    expect(afterUp).toHaveLength(ALL_INDEXER_MIGRATIONS.length);

    // 2) Down — revert last N
    for (let i = 0; i < rollbackCount; i++) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
    const afterDown = await executedMigrationNames(dataSource);
    expect(afterDown).toHaveLength(ALL_INDEXER_MIGRATIONS.length - rollbackCount);

    // 3) Up again — re-apply the reverted migrations
    await dataSource.runMigrations({ transaction: 'each' });
    const afterReUp = await executedMigrationNames(dataSource);
    expect(afterReUp).toHaveLength(ALL_INDEXER_MIGRATIONS.length);
    expect(afterReUp).toEqual(afterUp);
  });
});
