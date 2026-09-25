/**
 * backend-reader-role.integration.spec.ts
 *
 * Acceptance test for issue #1524.
 *
 * Verifies that after migrations run:
 *  1. backend_reader can SELECT from every indexer-owned table.
 *  2. backend_reader is rejected when it attempts an INSERT into any of those
 *     tables (proving the ownership boundary from #1468 is actually enforced).
 *
 * The test creates a dedicated login user (`backend_reader_login`) that has
 * the `backend_reader` role granted to it, then opens a second DataSource
 * connecting as that user to exercise the real privilege check.
 */

import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

/** All indexer-owned tables — must stay in sync with the migration. */
const INDEXER_TABLES = [
  'raffles',
  'tickets',
  'users',
  'raffle_events',
  'platform_stats',
  'platform_state',
  'indexer_cursor',
  'dead_letter_events',
  'webhooks',
  'webhook_deliveries',
  'webhook_dead_letter_deliveries',
  'archive_checkpoints',
] as const;

describe('backend_reader role (issue #1524)', () => {
  let ctx: DbContainerContext;
  let readerDs: DataSource;

  beforeAll(async () => {
    ctx = await startDb();

    // Create a real login user and assign the backend_reader role so we can
    // open a connection that exercises PostgreSQL privilege checks directly.
    await ctx.dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'backend_reader_login') THEN
          CREATE ROLE backend_reader_login LOGIN PASSWORD 'test_password';
        END IF;
      END $$
    `);
    await ctx.dataSource.query(
      `GRANT backend_reader TO backend_reader_login`,
    );

    // Open a second DataSource that authenticates as the restricted login user.
    const container: StartedPostgreSqlContainer = ctx.container;
    readerDs = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: 'backend_reader_login',
      password: 'test_password',
      database: container.getDatabase(),
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await readerDs.initialize();
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    if (readerDs?.isInitialized) {
      await readerDs.destroy();
    }
    if (ctx) {
      await stopDb(ctx);
    }
  });

  it('backend_reader_login can SELECT from every indexer-owned table', async () => {
    for (const tbl of INDEXER_TABLES) {
      // A simple COUNT(*) is sufficient to prove SELECT privilege is granted.
      await expect(
        readerDs.query(`SELECT COUNT(*) FROM public."${tbl}"`),
      ).resolves.toBeDefined();
    }
  });

  it('backend_reader_login is denied INSERT into every indexer-owned table', async () => {
    /**
     * We try to INSERT a minimal row into each table.  We only care about the
     * *permission* rejection (42501 insufficient_privilege), not about
     * constraint violations (23xxx) which would mean the row got past the
     * privilege check — that would be a test failure.
     *
     * The INSERT statement itself uses all-NULL values so we never need to
     * know the actual column list; PostgreSQL enforces privileges before
     * evaluating the column defaults or constraints.
     */
    for (const tbl of INDEXER_TABLES) {
      let caughtCode: string | undefined;
      try {
        // Deliberately malformed INSERT — triggers privilege check first.
        await readerDs.query(`INSERT INTO public."${tbl}" DEFAULT VALUES`);
        // If we reach here, no error was thrown — that is the failure.
        throw new Error(
          `Expected INSERT into public.${tbl} to be rejected for backend_reader_login, but it succeeded.`,
        );
      } catch (err: unknown) {
        const pgErr = err as { code?: string; message?: string };
        caughtCode = pgErr.code;
        if (caughtCode !== '42501') {
          // A non-permission error (e.g. constraint) means the INSERT reached
          // the table.  Re-throw so the test fails with a useful message.
          throw new Error(
            `public.${tbl}: expected PostgreSQL error code 42501 (insufficient_privilege) ` +
              `but got ${caughtCode ?? 'unknown'}: ${pgErr.message ?? String(err)}`,
          );
        }
      }

      expect(caughtCode).toBe('42501');
    }
  });
});
