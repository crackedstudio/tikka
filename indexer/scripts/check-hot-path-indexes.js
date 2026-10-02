const { Client } = require('pg');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://tikka:tikka-pass@127.0.0.1:5432/tikka';

const hotPathQueries = [
  {
    name: 'users leaderboard wins',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT * FROM users
      ORDER BY total_raffles_won DESC, address ASC
      LIMIT 50;
    `,
  },
  {
    name: 'users leaderboard prizes',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT * FROM users
      ORDER BY CAST(total_prize_xlm AS NUMERIC) DESC, address ASC
      LIMIT 50;
    `,
  },
  {
    name: 'raffles status feed',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT * FROM raffles
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT 20;
    `,
  },
  {
    name: 'tickets owner + raffle lookup',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT 1 FROM tickets
      WHERE owner = 'owner-123'
        AND raffle_id = 42
      LIMIT 1;
    `,
  },
  {
    name: 'raffle_events ledger range',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT COUNT(*) FROM raffle_events WHERE ledger >= 195000;
    `,
  },
  {
    name: 'raffle_events archive cursor',
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id FROM raffle_events
      WHERE indexed_at < NOW() - INTERVAL '30 days'
      ORDER BY indexed_at ASC, id ASC
      LIMIT 500;
    `,
  },
];

async function ensureSchema(client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      address TEXT NOT NULL,
      total_raffles_won INTEGER NOT NULL DEFAULT 0,
      total_prize_xlm NUMERIC(20, 7) NOT NULL DEFAULT 0,
      total_tickets_bought INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      raffle_id BIGINT NOT NULL,
      purchase_tx_hash TEXT NOT NULL,
      purchased_at_ledger BIGINT NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS raffles (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_ledger BIGINT NOT NULL DEFAULT 0,
      winner TEXT,
      asset TEXT NOT NULL DEFAULT 'XLM'
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS raffle_events (
      id SERIAL PRIMARY KEY,
      raffle_id BIGINT NOT NULL,
      ledger BIGINT NOT NULL,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS dead_letter_events (
      id SERIAL PRIMARY KEY,
      ledger BIGINT NOT NULL,
      replayed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS"
    ON users (total_raffles_won DESC, address ASC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS"
    ON users ((CAST(total_prize_xlm AS NUMERIC)) DESC, address ASC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS"
    ON users (total_tickets_bought DESC, address ASC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_tickets_owner_raffle_id"
    ON tickets (owner, raffle_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_tickets_purchased_at_ledger"
    ON tickets (purchased_at_ledger);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_raffles_status_created_at"
    ON raffles (status, created_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_raffles_created_ledger"
    ON raffles (created_ledger);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_raffles_winner_not_null"
    ON raffles (winner)
    WHERE winner IS NOT NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_raffle_events_ledger"
    ON raffle_events (ledger);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_raffle_events_indexed_at_id"
    ON raffle_events (indexed_at ASC, id ASC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_dle_ledger"
    ON dead_letter_events (ledger);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_dle_replay_eligible"
    ON dead_letter_events (replayed_at, ledger);
  `);
}

async function seedData(client) {
  await client.query(
    'TRUNCATE users, tickets, raffles, raffle_events, dead_letter_events RESTART IDENTITY;',
  );

  for (let i = 0; i < 25000; i += 1) {
    const address = `addr-${String(i).padStart(6, '0')}`;
    const status = i % 5 === 0 ? 'closed' : 'open';
    const owner = i % 200 === 0 ? 'owner-123' : `owner-${i % 77}`;

    await client.query(
      `INSERT INTO users (address, total_raffles_won, total_prize_xlm, total_tickets_bought)
       VALUES ($1, $2, $3, $4);`,
      [address, i % 250, Number((i * 3.14159).toFixed(7)), i % 321],
    );

    await client.query(
      `INSERT INTO tickets (owner, raffle_id, purchase_tx_hash, purchased_at_ledger)
       VALUES ($1, $2, $3, $4);`,
      [owner, i % 200 === 0 ? 42 : (i % 173) + 1, `tx-${i}`, i + 5000],
    );

    await client.query(
      `INSERT INTO raffles (status, created_at, created_ledger, winner, asset)
       VALUES ($1, NOW() - ($2 * INTERVAL '1 minute'), $3, $4, 'XLM');`,
      [status, i, i + 1000, i % 5 === 0 ? `winner-${i}` : null],
    );

    const ledger = i + 1000;
    const indexedAt =
      i < 5000
        ? `NOW() - INTERVAL '${i + 45} days'`
        : `NOW() - INTERVAL '${Math.max(1, i % 10)} days'`;
    await client.query(
      `INSERT INTO raffle_events (raffle_id, ledger, indexed_at)
       VALUES ($1, $2, ${indexedAt});`,
      [i % 100, ledger],
    );

    await client.query(
      `INSERT INTO dead_letter_events (ledger, replayed_at, created_at)
       VALUES ($1, NOW() - ($2 * INTERVAL '2 day'), NOW() - ($3 * INTERVAL '1 day'));`,
      [i + 1000, i % 7, i % 11],
    );
  }

  await client.query('ANALYZE users, tickets, raffles, raffle_events, dead_letter_events;');
}

async function runPlanCheck(client) {
  const failures = [];

  for (const item of hotPathQueries) {
    const row = await client.query(item.sql);
    const planText = row.rows.map((r) => r['QUERY PLAN']).join('\n');
    if (/\bSeq Scan\b/.test(planText)) {
      failures.push({ name: item.name, plan: planText });
    }
  }

  if (failures.length > 0) {
    console.error('Sequential scans detected on the hot-path queries:');
    failures.forEach(({ name, plan }) => {
      console.error(`\n## ${name}\n${plan}`);
    });
    process.exit(1);
  }

  console.log('Hot-path EXPLAIN plans avoid sequential scans on the critical indexer tables.');
}

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureSchema(client);
    await seedData(client);
    await runPlanCheck(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Hot-path audit failed:', error);
  process.exit(1);
});
