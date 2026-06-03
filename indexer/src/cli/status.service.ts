import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import Redis from 'ioredis';
import { LAG_THRESHOLD_DEFAULT } from '../health/health.service';

export interface DbPoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export interface CheckpointInfo {
  sequence: number;
  ledger_hash: string;
  processed_event_count: number;
  saved_at: string;
  version: number;
}

export interface StatusResult {
  timestamp: string;
  indexer: {
    current_ledger: number;
    horizon_ledger: number | null;
    lag_ledgers: number | null;
    /** Ingestor operational mode (RUNNING | DEGRADED | STOPPED). null if unknown. */
    mode: 'RUNNING' | 'DEGRADED' | 'STOPPED' | null;
    /** Last persisted checkpoint details. null if no checkpoint exists. */
    checkpoint: CheckpointInfo | null;
  };
  events: {
    total_processed: number;
    last_24h: number;
    last_processed_at: string | null;
  };
  dlq: {
    total: number;
  };
  cache: {
    status: 'ok' | 'error';
    latency_ms: number | null;
  };
  db: {
    status: 'ok' | 'error';
    pool: DbPoolStats | null;
  };
  warnings: string[];
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
    entities: [IndexerCursorEntity, RaffleEventEntity, DeadLetterEventEntity],
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
  let lastProcessedAt: string | null = null;
  let pool: DbPoolStats | null = null;
  let checkpoint: CheckpointInfo | null = null;

  try {
    await ds.initialize();
    dbStatus = 'ok';

    // Last processed ledger + checkpoint details from the cursor singleton row
    const cursorRow = await ds
      .getRepository(IndexerCursorEntity)
      .findOne({ where: { id: 1 } });
    currentLedger = cursorRow?.lastLedger ?? 0;

    if (cursorRow && cursorRow.lastLedger > 0) {
      const hashes = cursorRow.ledgerHashes ?? [];
      const lastHash = hashes[hashes.length - 1]?.hash ?? '';
      checkpoint = {
        sequence: cursorRow.lastLedger,
        ledger_hash: lastHash,
        processed_event_count: Number(cursorRow.processedEventCount),
        saved_at:
          cursorRow.savedAt instanceof Date
            ? cursorRow.savedAt.toISOString()
            : String(cursorRow.savedAt),
        version: cursorRow.checkpointVersion,
      };
    }

    // Event counts
    const eventRepo = ds.getRepository(RaffleEventEntity);
    totalEvents = await eventRepo.count();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    last24hEvents = await eventRepo
      .createQueryBuilder('e')
      .where('e.indexedAt >= :since', { since })
      .getCount();

    const lastEvent = await eventRepo.findOne({
      order: { indexedAt: 'DESC' },
    });
    lastProcessedAt = lastEvent ? lastEvent.indexedAt.toISOString() : null;

    // DLQ counts
    dlqTotal = await ds.getRepository(DeadLetterEventEntity).count();

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

  // Cache stats
  let cacheStatus: 'ok' | 'error' = 'error';
  let cacheLatency: number | null = null;
  const redisHost = process.env.REDIS_HOST ?? 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);
  try {
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    const start = Date.now();
    await redis.connect();
    await redis.ping();
    cacheLatency = Date.now() - start;
    cacheStatus = 'ok';
    redis.disconnect();
  } catch {
    // cacheStatus stays 'error'
  }

  const horizonLedger = await fetchHorizonLedger(horizonUrl);
  const lagLedgers =
    horizonLedger != null && currentLedger > 0
      ? Math.max(0, horizonLedger - currentLedger)
      : null;

  const warnings: string[] = [];
  if (dbStatus === 'error') {
    warnings.push('Database is unreachable. Check connection string and DB service.');
  }
  if (cacheStatus === 'error') {
    warnings.push('Redis cache is unreachable. Check REDIS_HOST and REDIS_PORT.');
  }
  if (lagLedgers !== null && lagLedgers > LAG_THRESHOLD_DEFAULT) {
    warnings.push(`Indexer lag is high (> ${LAG_THRESHOLD_DEFAULT} ledgers).`);
  }
  if (dlqTotal > 0) {
    warnings.push(`Dead-letter queue contains ${dlqTotal} events. Run 'pnpm run dlq:replay' to retry.`);
  }

  return {
    timestamp: new Date().toISOString(),
    indexer: {
      current_ledger: currentLedger,
      horizon_ledger: horizonLedger,
      lag_ledgers: lagLedgers,
      // mode is runtime state held in-memory by CursorManagerService;
      // the CLI reads the DB directly so we cannot know the live mode here.
      mode: null,
      checkpoint,
    },
    events: {
      total_processed: totalEvents,
      last_24h: last24hEvents,
      last_processed_at: lastProcessedAt,
    },
    dlq: {
      total: dlqTotal,
    },
    cache: {
      status: cacheStatus,
      latency_ms: cacheLatency,
    },
    db: {
      status: dbStatus,
      pool,
    },
    warnings,
  };
}
