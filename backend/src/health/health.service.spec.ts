import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PushNotificationService } from '../services/push-notification.service';

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
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('returns ok when all dependencies are healthy', async () => {
    // Indexer responds ok
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Supabase responds (any response = reachable)
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0].name).toBe('indexer');
    expect(result.dependencies[0].status).toBe('ok');
    expect(result.dependencies[1].name).toBe('supabase');
    expect(result.dependencies[1].status).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });

  it('returns degraded when indexer is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.find(d => d.name === 'indexer')?.status).toBe('error');
    expect(result.dependencies.find(d => d.name === 'supabase')?.status).toBe('ok');
  });

  it('returns degraded when supabase is unreachable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.find(d => d.name === 'indexer')?.status).toBe('ok');
    expect(result.dependencies.find(d => d.name === 'supabase')?.status).toBe('error');
  });

  it('returns degraded when both are down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.find(d => d.name === 'indexer')?.status).toBe('error');
    expect(result.dependencies.find(d => d.name === 'supabase')?.status).toBe('error');
  });

  it('treats indexer non-ok response as error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.dependencies.find(d => d.name === 'indexer')?.status).toBe('error');
    expect(result.dependencies.find(d => d.name === 'supabase')?.status).toBe('ok');
  });

  it('treats supabase non-ok response as reachable', async () => {
    // Supabase may return 401 — that still means it's reachable
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.dependencies.find(d => d.name === 'indexer')?.status).toBe('ok');
    expect(result.dependencies.find(d => d.name === 'supabase')?.status).toBe('ok');
  });

  it('returns liveness as always ok', async () => {
    const result = await service.getLiveness();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });

  it('returns readiness with dependency status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getReadiness();
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveLength(2);
    expect(result.timestamp).toBeDefined();
  });

  it('reports latency for each dependency', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    const indexer = result.dependencies.find(d => d.name === 'indexer');
    const supabase = result.dependencies.find(d => d.name === 'supabase');
    
    expect(indexer?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(supabase?.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
