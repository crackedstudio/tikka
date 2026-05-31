import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';

describe('migration smoke test', () => {
  let ctx: DbContainerContext;

  beforeAll(async () => {
    ctx = await startDb();
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => {
    if (ctx) {
      await stopDb(ctx);
    }
  });

  it('runs every migration from an empty database', async () => {
    const migrations = await ctx.dataSource.query(
      `SELECT name FROM migrations ORDER BY timestamp ASC`,
    );

    expect(migrations.map((row: { name: string }) => row.name)).toEqual([
      'CreateRaffles1700000000000',
      'CreateTickets1700000000001',
      'CreateUsers1700000000002',
      'CreateRaffleEvents1700000000003',
      'CreatePlatformStats1700000000004',
      'CreateIndexerCursor1700000000005',
      'CreatePlatformState1700000000006',
      'AddWebhooksTable1720000000000',
      'AddUserLastTxHash1720000000001',
    ]);
  });

  it('creates current indexes and constraints expected by entities', async () => {
    const indexes = await ctx.dataSource.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const constraints = await ctx.dataSource.query(
      `SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
    );
    const columns = await ctx.dataSource.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );

    const indexNames = indexes.map((row: { indexname: string }) => row.indexname);
    const constraintNames = constraints.map((row: { conname: string }) => row.conname);
    const columnNames = columns.map(
      (row: { table_name: string; column_name: string }) =>
        `${row.table_name}.${row.column_name}`,
    );

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_raffles_status',
        'idx_tickets_purchase_tx_hash',
        'idx_webhooks_active_events',
      ]),
    );
    expect(constraintNames).toEqual(
      expect.arrayContaining([
        'fk_tickets_raffle_id',
        'UQ_webhooks_url',
      ]),
    );
    expect(columnNames).toEqual(
      expect.arrayContaining([
        'users.last_tx_hash',
        'webhooks.supported_events',
        'indexer_cursor.last_paging_token',
      ]),
    );
  });
});
