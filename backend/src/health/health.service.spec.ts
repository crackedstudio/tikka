import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

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
      providers: [HealthService],
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
    expect(result.indexer).toBe('ok');
    expect(result.supabase).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });

  it('returns degraded when indexer is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('error');
    expect(result.supabase).toBe('ok');
  });

  it('returns degraded when supabase is unreachable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('ok');
    expect(result.supabase).toBe('error');
  });

  it('returns degraded when both are down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
    expect(result.indexer).toBe('error');
    expect(result.supabase).toBe('error');
  });

  it('treats indexer non-ok response as error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
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

    const result = await service.getHealth();
    expect(result.status).toBe('ok');
    expect(result.indexer).toBe('ok');
    expect(result.supabase).toBe('ok');
  });
});
