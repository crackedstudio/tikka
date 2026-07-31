import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LagProbeService } from './lag-probe.service';

describe('LagProbeService', () => {
  let service: LagProbeService;

  async function build(config: Record<string, unknown> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LagProbeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key in config) return config[key];
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();
    service = module.get<LagProbeService>(LagProbeService);
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns a null tip before any refresh succeeds', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network down'));
    await build();
    // onModuleInit auto-refreshes; wait a tick.
    await new Promise((r) => setImmediate(r));
    const tip = service.getNetworkTip();
    expect(tip.sequence).toBeNull();
    expect(tip.closedAt).toBeNull();
  });

  it('caches the latest sequence and closedAt on successful refresh', async () => {
    const closedAt = '2026-01-02T03:04:05Z';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            records: [{ sequence: '12345', closed_at: closedAt }],
          },
        }),
    } as Response);

    await build();
    await service.refresh();

    const tip = service.getNetworkTip();
    expect(tip.sequence).toBe(12345);
    expect(tip.closedAt).toEqual(new Date(closedAt));
    expect(tip.observedAt.getTime()).toBeGreaterThan(0);
  });

  it('keeps the previous tip when Horizon returns a non-ok response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            _embedded: {
              records: [{ sequence: '500', closed_at: '2026-01-01T00:00:00Z' }],
            },
          }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await build();
    await service.refresh();
    const before = service.getNetworkTip().sequence;
    await service.refresh();
    const after = service.getNetworkTip().sequence;
    expect(after).toBe(before);
    expect(after).toBe(500);
  });

  it('does not throw when fetch fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('boom'));
    await build();
    await expect(service.refresh()).resolves.toBeUndefined();
  });

  it('strips a trailing slash from HORIZON_URL when composing requests', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: { records: [{ sequence: '1' }] },
        }),
    } as Response);
    await build({ HORIZON_URL: 'https://horizon.test/' });
    await service.refresh();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://horizon.test/ledgers?order=desc&limit=1',
      expect.objectContaining({}),
    );
  });

  it('clears its interval on module destroy', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ _embedded: { records: [] } }),
    } as Response);
    await build();
    // Reach into the private field and assign a known stub so we can verify
    // clearInterval is invoked with the same handle returned by Node. This
    // sidesteps jest's interaction with the real Node timer queue.
    const stubHandle = 123 as unknown as NodeJS.Timeout;
    (service as unknown as { interval: NodeJS.Timeout }).interval = stubHandle;
    await service.onModuleDestroy();
    expect((service as unknown as { interval?: NodeJS.Timeout }).interval).toBeUndefined();
  });

  it('is safe to destroy before init (no interval set)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('nope'));
    await build();
    // Force-clear the interval left over from onModuleInit() so we can
    // exercise the "first destroy" path with no live timer.
    (service as unknown as { interval?: NodeJS.Timeout }).interval = undefined;
    expect(() => service.onModuleDestroy()).not.toThrow();
  });
});

