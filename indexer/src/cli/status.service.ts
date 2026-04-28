import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';

export interface DbPoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export interface StatusResult {
  timestamp: string;
  indexer: {
    current_ledger: number;
    horizon_ledger: number | null;
    lag_ledgers: number | null;
  };
  events: {
    total_processed: number;
    last_24h: number;
  };
  db: {
    status: 'ok' | 'error';
    pool: DbPoolStats | null;
  };
}

function buildDataSource(): DataSource {
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
    entities: [IndexerCursorEntity, RaffleEventEntity],
    synchronize: false,
    logging: false,
  };

  return new DataSource(options);
}

async function fetchHorizonLedger(horizonUrl: string): Promise<number | null> {
  try {
    const url = horizonUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/ledgers?order=desc&limit=1`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      _embedded?: { records?: Array<{ sequence: string }> };
    };
    const seq = json._embedded?.records?.[0]?.sequence;
    return seq != null ? parseInt(seq, 10) : null;
  } catch {
    return null;
  }
}

export async function fetchStatus(): Promise<StatusResult> {
  const horizonUrl = process.env.HORIZON_URL ?? 'https://horizon.stellar.org';

  const ds = buildDataSource();
  let dbStatus: 'ok' | 'error' = 'error';
  let currentLedger = 0;
  let totalEvents = 0;
  let last24hEvents = 0;
  let pool: DbPoolStats | null = null;

  try {
    await ds.initialize();
    dbStatus = 'ok';

    // Last processed ledger from the cursor singleton row
    const cursorRow = await ds
      .getRepository(IndexerCursorEntity)
      .findOne({ where: { id: 1 } });
    currentLedger = cursorRow?.lastLedger ?? 0;

    // Event counts
    const eventRepo = ds.getRepository(RaffleEventEntity);
    totalEvents = await eventRepo.count();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    last24hEvents = await eventRepo
      .createQueryBuilder('e')
      .where('e.indexedAt >= :since', { since })
      .getCount();

    // DB pool stats via pg driver internals (best-effort)
    const driver = ds.driver as any;
    const pgPool = driver?.master ?? driver?.pool;
    if (pgPool) {
      pool = {
        total: pgPool.totalCount ?? pgPool._clients?.length ?? 0,
        idle: pgPool.idleCount ?? pgPool._idleQueue?.length ?? 0,
        waiting: pgPool.waitingCount ?? pgPool._pendingQueue?.length ?? 0,
      };
    }
  } catch {
    // dbStatus stays 'error'
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }

  const horizonLedger = await fetchHorizonLedger(horizonUrl);
  const lagLedgers =
    horizonLedger != null && currentLedger > 0
      ? Math.max(0, horizonLedger - currentLedger)
      : null;

  return {
    timestamp: new Date().toISOString(),
    indexer: {
      current_ledger: currentLedger,
      horizon_ledger: horizonLedger,
      lag_ledgers: lagLedgers,
    },
    events: {
      total_processed: totalEvents,
      last_24h: last24hEvents,
    },
    db: {
      status: dbStatus,
      pool,
    },
  };
}
