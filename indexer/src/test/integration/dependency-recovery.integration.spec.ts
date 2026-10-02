// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { TicketEntity } from '../../database/entities/ticket.entity';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import { CursorManagerService } from '../../ingestor/cursor-manager.service';
import { IngestionDispatcherService } from '../../ingestor/ingestion-dispatcher.service';
import { LedgerPollerService } from '../../ingestor/ledger-poller.service';
import { TicketProcessor } from '../../processors/ticket.processor';
import { UserProcessor } from '../../processors/user.processor';
import {
  buildDataSource,
  CONTAINER_STARTUP_MS,
  DbContainerContext,
  startDb,
  stopDb,
} from './helpers/db-container';
import { CREATOR_ADDRESS, makeTicketPurchasedEvent, mockTxHash } from './helpers/mock-events';

const CONTRACT_ID = 'CCONTRACT00000000000000000000000000000000000000000000000000';

const mockWebhookService = { dispatch: jest.fn().mockResolvedValue(undefined) };
const mockCacheService = {
  invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
  invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
};

let db: DbContainerContext;
let redisContainer: StartedTestContainer;

function makeDispatcher(dataSource: DataSource, cache: unknown) {
  const userProcessor = new UserProcessor(dataSource, cache as any);
  const ticketProcessor = new TicketProcessor(
    cache as any,
    userProcessor,
    mockWebhookService as any,
  );
  const dispatcher = new IngestionDispatcherService(
    dataSource,
    {} as any,
    ticketProcessor,
    {} as any,
  );
  return { dispatcher, ticketProcessor };
}

function makePoller(
  cursorManager: CursorManagerService,
  dispatcher: IngestionDispatcherService,
  parse: (event: unknown) => unknown,
  horizonUrl = 'https://horizon.stellar.org',
) {
  const metrics = {
    incrementErrors: jest.fn(),
    incrementEventsProcessed: jest.fn(),
    setLagLedgers: jest.fn(),
    recordPollDuration: jest.fn(),
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      ({
        HORIZON_URL: horizonUrl,
        TIKKA_CONTRACT_ID: CONTRACT_ID,
        INGESTION_BATCH_SIZE: 1,
        REORG_SAFETY_DEPTH: 5,
      })[key] ?? fallback,
  };
  return new LedgerPollerService(
    config as any,
    cursorManager,
    { parse } as any,
    { enabled: false } as any,
    dispatcher,
    metrics as any,
    { rollback: jest.fn() } as any,
  );
}

async function seedRaffle(dataSource: DataSource): Promise<void> {
  await dataSource.getRepository(RaffleEntity).save({
    id: 1,
    creator: CREATOR_ADDRESS,
    status: RaffleStatus.OPEN,
    ticketPrice: '10000000',
    asset: 'XLM',
    maxTickets: 100,
    endTime: '9999999999',
    createdLedger: 1,
  });
}

function rawEvent(ledger: number, seed: number) {
  const txHash = mockTxHash(seed);
  return {
    id: txHash,
    paging_token: `${ledger}-${seed}`,
    ledger,
    ledger_hash: `ledger-hash-${ledger}`,
    contract_id: CONTRACT_ID,
    type: 'contract',
    topic: ['contract', 'TicketPurchased'],
    value: 'AA==',
  };
}

async function truncate(dataSource: DataSource): Promise<void> {
  await dataSource.query("SET session_replication_role = 'replica'");
  await dataSource.query(
    'TRUNCATE TABLE dead_letter_events, raffle_events, tickets, users, raffles, indexer_cursor RESTART IDENTITY CASCADE',
  );
  await dataSource.query("SET session_replication_role = 'origin'");
}

async function restartDataSource(): Promise<void> {
  const previousDataSource = db.dataSource;
  const mappedPort = Number(
    execFileSync(
      'docker',
      [
        'inspect',
        '-f',
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
        db.container.getId(),
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  const dataSource = buildDataSource(db.container, mappedPort);
  await dataSource.initialize();
  db.dataSource = dataSource;
  if (previousDataSource.isInitialized) await previousDataSource.destroy();
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      execFileSync(
        'docker',
        ['exec', db.container.getId(), 'pg_isready', '-U', 'tikka', '-d', 'tikka_test'],
        { stdio: 'ignore' },
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('PostgreSQL did not become ready after failover');
}

beforeAll(async () => {
  db = await startDb();
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withCommand([
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
      '--maxmemory',
      '4mb',
      '--maxmemory-policy',
      'allkeys-lru',
    ])
    .start();
}, CONTAINER_STARTUP_MS);

afterAll(async () => {
  await stopDb(db);
  await redisContainer?.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await truncate(db.dataSource);
});

describe('dependency recovery during ingestion', () => {
  it('holds the cursor through a Postgres outage and replays without data loss', async () => {
    const previousRetries = process.env.MAX_DISPATCH_RETRIES;
    const previousDelay = process.env.BASE_RETRY_DELAY_MS;
    process.env.MAX_DISPATCH_RETRIES = '1';
    process.env.BASE_RETRY_DELAY_MS = '0';
    const dataSource = db.dataSource;
    await seedRaffle(dataSource);
    const cursorManager = new CursorManagerService(dataSource.getRepository(IndexerCursorEntity));
    await cursorManager.saveCursor(900, 'ledger-hash-900', '900-token', 0);
    const { dispatcher } = makeDispatcher(dataSource, mockCacheService);
    const firstRaw = rawEvent(910, 910);
    const secondRaw = rawEvent(920, 920);
    let postgresStopped = false;
    const poller = makePoller(
      cursorManager,
      {
        dispatchBatch: async (items) => {
          const first = await dispatcher.dispatchBatch([items[0]]);
          execFileSync('docker', ['stop', db.container.getId()], { stdio: 'ignore' });
          postgresStopped = true;
          const failed = await dispatcher.dispatchBatch([items[1]]);
          execFileSync('docker', ['start', db.container.getId()], { stdio: 'ignore' });
          await waitForPostgres();
          postgresStopped = false;
          return [...first, ...failed];
        },
      } as any,
      () => makeTicketPurchasedEvent(),
    );

    try {
      await (poller as any).processBatch([
        { parsed: makeTicketPurchasedEvent({ ticket_ids: [11] }), raw: firstRaw },
        { parsed: makeTicketPurchasedEvent({ ticket_ids: [12] }), raw: secondRaw },
      ]);
      await restartDataSource();

      const recovered = db.dataSource;
      const savedCursor = await recovered.getRepository(IndexerCursorEntity).findOneBy({ id: 1 });
      expect(savedCursor?.lastLedger).toBe(900);

      const recoveredCursorManager = new CursorManagerService(
        recovered.getRepository(IndexerCursorEntity),
      );
      const { dispatcher: recoveredDispatcher } = makeDispatcher(recovered, mockCacheService);
      const recoveredPoller = makePoller(recoveredCursorManager, recoveredDispatcher, () =>
        makeTicketPurchasedEvent(),
      );
      await (recoveredPoller as any).processBatch([
        { parsed: makeTicketPurchasedEvent({ ticket_ids: [11] }), raw: firstRaw },
        { parsed: makeTicketPurchasedEvent({ ticket_ids: [12] }), raw: secondRaw },
      ]);

      const tickets = await recovered.getRepository(TicketEntity).find();
      const raffle = await recovered.getRepository(RaffleEntity).findOneBy({ id: 1 });
      const finalCursor = await recovered.getRepository(IndexerCursorEntity).findOneBy({ id: 1 });
      expect(tickets).toHaveLength(2);
      expect(tickets.map((ticket) => ticket.id).sort()).toEqual([11, 12]);
      expect(raffle?.ticketsSold).toBe(2);
      expect(finalCursor?.lastLedger).toBe(920);
    } finally {
      if (postgresStopped) {
        execFileSync('docker', ['start', db.container.getId()], { stdio: 'ignore' });
        await waitForPostgres();
        await restartDataSource();
      }
      if (previousRetries === undefined) delete process.env.MAX_DISPATCH_RETRIES;
      else process.env.MAX_DISPATCH_RETRIES = previousRetries;
      if (previousDelay === undefined) delete process.env.BASE_RETRY_DELAY_MS;
      else process.env.BASE_RETRY_DELAY_MS = previousDelay;
    }
  }, 120_000);

  it('keeps duplicate delivery idempotent after Redis evicts keys under memory pressure', async () => {
    const dataSource = db.dataSource;
    await seedRaffle(dataSource);
    const cache = new CacheService({
      get: (key: string, fallback?: unknown) =>
        key === 'REDIS_HOST'
          ? redisContainer.getHost()
          : key === 'REDIS_PORT'
            ? redisContainer.getMappedPort(6379)
            : fallback,
    } as any);
    cache.onModuleInit();

    const redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    });
    try {
      for (let attempt = 0; attempt < 40 && !(await cache.ping()); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const { dispatcher } = makeDispatcher(dataSource, cache);
      const event = makeTicketPurchasedEvent({ ticket_ids: [31, 32] });
      const raw = rawEvent(1000, 1000);

      await dispatcher.dispatch(event, raw);
      await redis.set('recent-cache-entry', 'x'.repeat(64 * 1024));
      for (let key = 0; key < 160; key++) {
        await redis.set(`memory-pressure:${key}`, 'x'.repeat(64 * 1024));
      }

      const stats = await redis.info('stats');
      const evictedKeys = Number(stats.match(/evicted_keys:(\d+)/)?.[1] ?? 0);
      expect(evictedKeys).toBeGreaterThan(0);

      await dispatcher.dispatch(event, raw);

      const tickets = await dataSource.getRepository(TicketEntity).find();
      const raffle = await dataSource.getRepository(RaffleEntity).findOneBy({ id: 1 });
      expect(tickets).toHaveLength(2);
      expect(tickets.map((ticket) => ticket.id).sort()).toEqual([31, 32]);
      expect(raffle?.ticketsSold).toBe(2);
    } finally {
      redis.disconnect();
      cache.onModuleDestroy();
    }
  }, 60_000);

  it('recovers from a partial Horizon response without advancing past unprocessed events', async () => {
    const dataSource = db.dataSource;
    await seedRaffle(dataSource);
    const cursorManager = new CursorManagerService(dataSource.getRepository(IndexerCursorEntity));
    await cursorManager.saveCursor(1000, 'ledger-hash-1000', '1000-token', 0);

    const event = rawEvent(1010, 1010);
    let eventRequests = 0;
    const server = createServer((request, response) => {
      if (request.url?.startsWith('/events')) {
        eventRequests++;
        response.writeHead(200, { 'content-type': 'application/json' });
        if (eventRequests === 1) {
          response.end('{"_embedded":{"records":');
          return;
        }
        const baseUrl = `http://${request.headers.host}`;
        response.end(
          JSON.stringify({
            _links: {
              self: { href: `${baseUrl}${request.url}` },
              next: { href: `${baseUrl}${request.url}` },
              prev: { href: `${baseUrl}${request.url}` },
            },
            _embedded: { records: [event] },
          }),
        );
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ _embedded: { records: [{ sequence: '1020' }] } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const horizonUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { dispatcher } = makeDispatcher(dataSource, mockCacheService);
    const poller = makePoller(
      cursorManager,
      dispatcher,
      () => makeTicketPurchasedEvent({ ticket_ids: [41] }),
      'https://horizon.stellar.org',
    );
    (poller as any).horizonServer = {
      events: () => ({
        cursor: () => ({
          limit: () => ({
            call: async () => {
              const response = await fetch(`${horizonUrl}/events`);
              const payload = await response.json();
              return { records: payload._embedded.records };
            },
          }),
        }),
      }),
      ledgers: () => ({
        order: () => ({
          limit: () => ({
            call: async () => ({ records: [{ sequence: '1020' }] }),
          }),
        }),
      }),
    };

    try {
      (poller as any).isRunning = true;
      await (poller as any).pollOnce();
      poller['stopIngestion']();
      expect((await cursorManager.getCursor())?.lastLedger).toBe(1000);

      await (poller as any).pollOnce();
      poller['stopIngestion']();
      (poller as any).isRunning = false;

      expect(eventRequests).toBe(2);
      expect((await cursorManager.getCursor())?.lastLedger).toBe(1010);
      expect(await dataSource.getRepository(TicketEntity).count()).toBe(1);
    } finally {
      (poller as any).isRunning = false;
      poller['stopIngestion']();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 60_000);
});
