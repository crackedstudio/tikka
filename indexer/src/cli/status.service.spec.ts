import { fetchStatus } from './status.service';
import { DataSource } from 'typeorm';
import { LAG_THRESHOLD_DEFAULT } from '../health/health.service';

// ---------- ioredis mock ----------
// ioredis exports a class as the default export.
// We provide a factory that returns a jest.fn() constructor so we can
// control what each instance returns via mockImplementation in beforeEach.
const mockRedisInstance = {
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn(() => mockRedisInstance),
  };
});

// ---------- typeorm mock ----------
jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    DataSource: jest.fn(),
  };
});

// ---------- global fetch mock ----------
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

// ---------- helpers ----------
let mockInitialize: jest.Mock;
let mockDestroy: jest.Mock;
let mockGetRepository: jest.Mock;

describe('status.service CLI', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // DB
    mockInitialize = jest.fn().mockResolvedValue(undefined);
    mockDestroy = jest.fn().mockResolvedValue(undefined);
    mockGetRepository = jest.fn();

    (DataSource as jest.Mock).mockImplementation(() => ({
      initialize: mockInitialize,
      destroy: mockDestroy,
      getRepository: mockGetRepository,
      isInitialized: true,
      driver: { master: { totalCount: 5, idleCount: 5, waitingCount: 0 } },
    }));

    // Redis — defaults to a healthy ping
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockRedisInstance.disconnect.mockReturnValue(undefined);
  });

  function setupDbMocks(currentLedger: number, totalEvents: number, dlqTotal: number) {
    mockGetRepository.mockImplementation((entity: { name: string }) => {
      if (entity.name === 'IndexerCursorEntity') {
        return { findOne: jest.fn().mockResolvedValue({ id: 1, lastLedger: currentLedger }) };
      }
      if (entity.name === 'RaffleEventEntity') {
        return {
          count: jest.fn().mockResolvedValue(totalEvents),
          createQueryBuilder: () => ({
            where: () => ({ getCount: jest.fn().mockResolvedValue(0) }),
          }),
          findOne: jest.fn().mockResolvedValue({ indexedAt: new Date('2023-10-27T10:00:00.000Z') }),
        };
      }
      if (entity.name === 'DeadLetterEventEntity') {
        return { count: jest.fn().mockResolvedValue(dlqTotal) };
      }
      return {};
    });
  }

  function setupHorizonMock(latestLedger: number | null) {
    if (latestLedger === null) {
      mockFetch.mockResolvedValueOnce({ ok: false });
    } else {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: { records: [{ sequence: latestLedger.toString() }] },
        }),
      });
    }
  }

  // ── Healthy state ─────────────────────────────────────────────────────────
  it('should return healthy state with no warnings', async () => {
    setupDbMocks(1000, 50, 0);
    setupHorizonMock(1002); // lag = 2, within threshold

    const result = await fetchStatus();

    expect(result.db.status).toBe('ok');
    expect(result.cache.status).toBe('ok');
    expect(result.indexer.lag_ledgers).toBe(2);
    expect(result.dlq.total).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  // ── Lagging state ─────────────────────────────────────────────────────────
  it('should generate a warning when lag exceeds threshold', async () => {
    setupDbMocks(1000, 50, 0);
    const highLagLedger = 1000 + LAG_THRESHOLD_DEFAULT + 10;
    setupHorizonMock(highLagLedger);

    const result = await fetchStatus();

    expect(result.indexer.lag_ledgers).toBe(LAG_THRESHOLD_DEFAULT + 10);
    expect(result.warnings).toContain(
      `Indexer lag is high (> ${LAG_THRESHOLD_DEFAULT} ledgers).`,
    );
  });

  // ── DLQ-heavy state ───────────────────────────────────────────────────────
  it('should generate a warning when DLQ has items', async () => {
    setupDbMocks(1000, 50, 5);
    setupHorizonMock(1000);

    const result = await fetchStatus();

    expect(result.dlq.total).toBe(5);
    expect(result.warnings).toContain(
      `Dead-letter queue contains 5 events. Run 'pnpm run dlq:replay' to retry.`,
    );
  });

  // ── Degraded dependencies ─────────────────────────────────────────────────
  it('should generate warnings for unreachable DB and Redis', async () => {
    // DB fails
    mockInitialize.mockRejectedValueOnce(new Error('DB unreachable'));
    // Redis ping fails
    mockRedisInstance.connect.mockRejectedValueOnce(new Error('Redis unreachable'));
    // Horizon unreachable
    setupHorizonMock(null);

    const result = await fetchStatus();

    expect(result.db.status).toBe('error');
    expect(result.cache.status).toBe('error');
    expect(result.warnings).toContain(
      'Database is unreachable. Check connection string and DB service.',
    );
    expect(result.warnings).toContain(
      'Redis cache is unreachable. Check REDIS_HOST and REDIS_PORT.',
    );
  });
});
