import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PushNotificationService } from '../services/notifications/push-notification.service';
import { MaintenanceModeService } from '../maintenance/maintenance-mode.service';
import { MetadataRedisService } from '../services/metadata/metadata-redis.service';

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'INDEXER_URL') return 'http://indexer.test';
              throw new Error(`unexpected key ${key}`);
            },
            get: (key: string, def?: number) =>
              key === 'INDEXER_TIMEOUT_MS' ? 3000 : def,
          },
        },
        {
          provide: PushNotificationService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(false),
            getDeliveryMetrics: jest.fn().mockReturnValue({
              transientRetry: 0,
              permanentInvalidToken: 0,
              permanentOther: 0,
              providerOutage: 0,
              totalFailures: 0,
            }),
          },
        },
        {
          provide: MaintenanceModeService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: MetadataRedisService,
          useValue: { ping: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('returns ok when all dependencies are healthy', async () => {
    // Indexer responds ok
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Supabase responds (any response = reachable)
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Database query succeeds
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.indexer).toBe('ok');
    expect(result.database).toBe('ok');
    expect(result.redis).toBe('ok');
    expect(result.supabase).toBe('ok');
    expect(result.emailProvider).toBe('not_configured');
    expect(result.timestamp).toBeDefined();
  });

  it('returns degraded when indexer is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('error');
    expect(result.supabase).toBe('ok');
  });

  it('returns degraded when supabase is unreachable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('ok');
    expect(result.supabase).toBe('error');
  });

  it('returns degraded when both are down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('error');
    expect(result.supabase).toBe('error');
  });

  it('treats indexer non-ok response as error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('error');
    expect(result.supabase).toBe('ok');
  });

  it('treats supabase non-ok response as reachable', async () => {
    // Supabase may return 401 — that still means it's reachable
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.indexer).toBe('ok');
    expect(result.supabase).toBe('ok');
  });

  it('reports Redis as unhealthy when its ping fails', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const redis = module.get<MetadataRedisService>(MetadataRedisService);
    jest.spyOn(redis, 'ping').mockResolvedValue(false);

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.redis).toBe('error');
    expect(result.unhealthy).toContain('redis');
  });

  it('reports database as unhealthy when its query fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('error');
    expect(result.unhealthy).toContain('database');
  });
});
