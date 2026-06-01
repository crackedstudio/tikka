import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { SUPABASE_CLIENT } from '../services/supabase.provider';
import { HealthService } from './health.service';

const originalFetch = global.fetch;
let mockFetch: jest.Mock;
let mockRedisInstance: {
  status: string;
  connect: jest.Mock;
  ping: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

function buildSupabaseMock(overrides: {
  dbError?: { message: string } | null;
  storageError?: { message: string } | null;
} = {}) {
  const { dbError = null, storageError = null } = overrides;
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ error: dbError }),
      }),
    }),
    storage: {
      from: jest.fn().mockReturnValue({
        list: jest.fn().mockResolvedValue({ error: storageError }),
      }),
    },
  };
}

function buildConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === 'INDEXER_URL') return 'http://indexer.test';
      if (key === 'REDIS_URL') return 'redis://redis.test:6379';
      throw new Error(`unexpected key ${key}`);
    },
    get: (key: string, def?: number) => {
      if (key === 'INDEXER_TIMEOUT_MS') return 3000;
      if (key === 'HEALTH_CHECK_TIMEOUT_MS') return 3000;
      if (key === 'BACKFILL_HORIZON_TIMEOUT_MS') return 5000;
      return def;
    },
  } as unknown as ConfigService;
}

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  mockRedisInstance = {
    status: 'ready',
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on: jest.fn(),
  };

  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.STELLAR_NETWORK = 'testnet';
  process.env.FCM_ENABLED = 'false';
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('HealthService', () => {
  let service: HealthService;

  async function buildService(
    supabaseOverrides: Parameters<typeof buildSupabaseMock>[0] = {},
  ) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: buildConfigService() },
        {
          provide: SUPABASE_CLIENT,
          useValue: buildSupabaseMock(supabaseOverrides),
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    service.onModuleInit();
  }

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
  });

  function mockAllHealthy(): void {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('indexer.test')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('supabase.co')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('horizon-testnet')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    });
  }

  it('getLiveness returns ok with uptime', async () => {
    await buildService();
    const result = service.getLiveness();
    expect(result.status).toBe('ok');
    expect(result.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
  });

  it('returns ready when all critical dependencies are healthy', async () => {
    await buildService();
    mockAllHealthy();

    const result = await service.getReadiness();
    expect(result.status).toBe('ready');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.redis.status).toBe('ok');
    expect(result.checks.supabase.status).toBe('ok');
    expect(result.checks.indexer.status).toBe('ok');
  });

  it('returns not_ready when redis fails', async () => {
    await buildService();
    mockAllHealthy();
    mockRedisInstance.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.getReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.redis.status).toBe('error');
  });

  it('returns not_ready when database query fails', async () => {
    await buildService({ dbError: { message: 'connection failed' } });
    mockAllHealthy();

    const result = await service.getReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('error');
  });

  it('returns not_ready when indexer is down', async () => {
    await buildService();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('indexer.test')) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve({ ok: true });
    });

    const result = await service.getReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.indexer.status).toBe('error');
  });

  it('returns ok health when all dependencies are healthy', async () => {
    await buildService();
    mockAllHealthy();

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.redis.status).toBe('ok');
    expect(result.dependencies.supabase.status).toBe('ok');
    expect(result.dependencies.indexer.status).toBe('ok');
    expect(result.dependencies.horizon.status).toBe('ok');
    expect(result.dependencies.storage.status).toBe('ok');
    expect(result.dependencies.notifications.status).toBe('skipped');
    expect(result.pushDelivery).toBeDefined();
  });

  it('returns degraded when horizon is unreachable but critical deps are ok', async () => {
    await buildService();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('horizon-testnet')) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      if (url.includes('indexer.test')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('supabase.co')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies.horizon.status).toBe('degraded');
    expect(result.dependencies.indexer.status).toBe('ok');
  });

  it('returns unhealthy when supabase rest is unreachable', async () => {
    await buildService();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('supabase.co/rest')) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      if (url.includes('indexer.test')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('horizon-testnet')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await service.getHealth();
    expect(result.status).toBe('unhealthy');
    expect(result.dependencies.supabase.status).toBe('error');
  });

  it('returns degraded when storage probe fails but critical deps are ok', async () => {
    await buildService({ storageError: { message: 'bucket missing' } });
    mockAllHealthy();

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies.storage.status).toBe('degraded');
    expect(result.dependencies.database.status).toBe('ok');
  });

  it('reports FCM as ok when enabled', async () => {
    await buildService();
    mockAllHealthy();
    process.env.FCM_ENABLED = 'true';

    const result = await service.getHealth();
    expect(result.dependencies.notifications.status).toBe('ok');
  });

  it('does not leak secrets in dependency detail fields', async () => {
    await buildService();
    mockAllHealthy();

    const result = await service.getHealth();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('test-service-role-key');
    expect(serialized).not.toContain('redis://');
    expect(result.dependencies.supabase.detail).toContain('project.supabase.co');
  });

  it('initializes a redis client from REDIS_URL', async () => {
    await buildService();
    expect(Redis).toHaveBeenCalledWith(
      'redis://redis.test:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });
});
