import { StellarSubscriberService } from './stellar-subscriber.service';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health/health.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx(paging_token: string, hash = `hash-${paging_token}`) {
  return { paging_token, hash };
}

function makeHealthService(): jest.Mocked<HealthService> {
  return {
    updateStreamStatus: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({ streamStatus: 'disconnected' }),
  } as unknown as jest.Mocked<HealthService>;
}

function makeConfigService(url = 'https://horizon-testnet.stellar.org'): ConfigService {
  return { get: jest.fn().mockReturnValue(url) } as unknown as ConfigService;
}

/** Build service with a controllable mock Horizon server injected. */
function buildService(horizonOverride?: any) {
  const health = makeHealthService();
  const config = makeConfigService();
  const service = new StellarSubscriberService(config, health);

  if (horizonOverride) {
    (service as any).horizonServer = horizonOverride;
  }

  return { service, health };
}

// ─── Disconnect + reconnect ───────────────────────────────────────────────────

describe('StellarSubscriberService — disconnect and reconnect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sets stream status to reconnecting then restarts the stream', async () => {
    const closeFn = jest.fn();
    const streamFn = jest.fn().mockReturnValue(closeFn);
    const horizonMock = {
      transactions: () => ({
        cursor: () => ({ stream: streamFn }),
      }),
    };

    const { service, health } = buildService(horizonMock);

    // Simulate initial stream start
    (service as any).closeStream = closeFn;
    (service as any).lastSeenCursor = null;

    // Trigger restart
    (service as any).restartStream('test disconnect');

    expect(health.updateStreamStatus).toHaveBeenCalledWith('reconnecting', 'test disconnect');
    expect((service as any).isRestarting).toBe(true);

    // Advance past RECONNECT_DELAY_MS
    await jest.runAllTimersAsync();

    expect((service as any).isRestarting).toBe(false);
  });

  it('does not double-restart when isRestarting is true', () => {
    const { service, health } = buildService();
    (service as any).isRestarting = true;

    (service as any).restartStream('second call');

    // Should not call updateStreamStatus again
    expect(health.updateStreamStatus).not.toHaveBeenCalled();
  });
});

// ─── Backfill ─────────────────────────────────────────────────────────────────

describe('StellarSubscriberService — backfill', () => {
  it('processes missed transactions in order and records cursors', async () => {
    const records = [
      makeTx('100'), makeTx('101'), makeTx('102'),
    ];

    const pageMock = {
      records,
      next: jest.fn().mockResolvedValue({ records: [], next: jest.fn() }),
    };

    const horizonMock = {
      transactions: () => ({
        cursor: () => ({
          order: () => ({
            limit: () => ({ call: jest.fn().mockResolvedValue(pageMock) }),
          }),
        }),
      }),
    };

    const { service } = buildService(horizonMock);

    await service.backfill('99');

    expect(service.getLastSeenCursor()).toBe('102');
  });

  it('skips already-seen cursors during backfill (duplicate suppression)', async () => {
    const { service } = buildService();

    // Pre-populate seen set with cursor '101'
    (service as any).seenCursors.add('101');

    const records = [makeTx('101'), makeTx('102')];
    const pageMock = {
      records,
      next: jest.fn().mockResolvedValue({ records: [], next: jest.fn() }),
    };

    const horizonMock = {
      transactions: () => ({
        cursor: () => ({
          order: () => ({
            limit: () => ({ call: jest.fn().mockResolvedValue(pageMock) }),
          }),
        }),
      }),
    };

    (service as any).horizonServer = horizonMock;

    await service.backfill('100');

    // Only '102' should be newly recorded
    expect(service.getLastSeenCursor()).toBe('102');
    expect((service as any).seenCursors.has('102')).toBe(true);
  });

  it('handles backfill errors gracefully without throwing', async () => {
    const horizonMock = {
      transactions: () => ({
        cursor: () => ({
          order: () => ({
            limit: () => ({
              call: jest.fn().mockRejectedValue(new Error('horizon down')),
            }),
          }),
        }),
      }),
    };

    const { service } = buildService(horizonMock);

    await expect(service.backfill('50')).resolves.not.toThrow();
  });

  it('resumes live stream from last seen cursor after backfill on reconnect', async () => {
    jest.useFakeTimers();

    const closeFn = jest.fn();
    const streamFn = jest.fn().mockReturnValue(closeFn);

    let capturedCursor: string | undefined;
    const horizonMock = {
      transactions: () => ({
        cursor: (c: string) => {
          capturedCursor = c;
          return {
            stream: streamFn,
            order: () => ({
              limit: () => ({
                call: jest
                  .fn()
                  .mockResolvedValue({ records: [], next: jest.fn() }),
              }),
            }),
          };
        },
      }),
    };

    const { service } = buildService(horizonMock);
    (service as any).lastSeenCursor = 'cursor-42';
    (service as any).closeStream = null;

    (service as any).restartStream('heartbeat timeout');

    await jest.runAllTimersAsync();

    // The live stream should have been started from the last seen cursor
    expect(capturedCursor).toBe('cursor-42');

    jest.useRealTimers();
  });
});

// ─── Duplicate suppression ────────────────────────────────────────────────────

describe('StellarSubscriberService — duplicate suppression', () => {
  it('ignores events whose cursor has already been seen', () => {
    const { service, health } = buildService();
    health.getMetrics.mockReturnValue({ streamStatus: 'connected' } as any);

    // Simulate receiving a message
    (service as any).handleMessage(makeTx('200'));
    expect(service.getLastSeenCursor()).toBe('200');

    // Receive same message again
    (service as any).handleMessage(makeTx('200'));

    // Cursor set should still have exactly one entry for '200'
    expect((service as any).seenCursors.size).toBe(1);
    expect(service.getLastSeenCursor()).toBe('200');
  });

  it('processes a new event after seeing a duplicate', () => {
    const { service, health } = buildService();
    health.getMetrics.mockReturnValue({ streamStatus: 'connected' } as any);

    (service as any).handleMessage(makeTx('300'));
    (service as any).handleMessage(makeTx('300')); // duplicate
    (service as any).handleMessage(makeTx('301')); // new

    expect(service.getLastSeenCursor()).toBe('301');
    expect((service as any).seenCursors.has('300')).toBe(true);
    expect((service as any).seenCursors.has('301')).toBe(true);
  });

  it('evicts oldest cursors when seenCursors exceeds MAX_SEEN_IDS', () => {
    const { service } = buildService();
    const maxIds = 10_000;

    // Pre-fill up to the limit
    for (let i = 0; i < maxIds; i++) {
      (service as any).seenCursors.add(String(i));
    }

    // Recording one more should evict the oldest ('0')
    (service as any).recordCursor('overflow');

    expect((service as any).seenCursors.has('0')).toBe(false);
    expect((service as any).seenCursors.has('overflow')).toBe(true);
    expect((service as any).seenCursors.size).toBe(maxIds);
  });
});

// ─── Lag reporting ────────────────────────────────────────────────────────────

describe('StellarSubscriberService — health / lag', () => {
  it('getSubscriberLag returns 0 when no cursor is recorded', () => {
    const { service } = buildService();
    expect(service.getSubscriberLag()).toBe(0);
  });

  it('getSubscriberLag returns seenCursors.size when cursor exists', () => {
    const { service, health } = buildService();
    health.getMetrics.mockReturnValue({ streamStatus: 'connected' } as any);

    (service as any).handleMessage(makeTx('10'));
    (service as any).handleMessage(makeTx('11'));

    expect(service.getSubscriberLag()).toBe(2);
  });

  it('updates stream status to connected on first message', () => {
    const { service, health } = buildService();
    health.getMetrics.mockReturnValue({ streamStatus: 'disconnected' } as any);

    (service as any).handleMessage(makeTx('50'));

    expect(health.updateStreamStatus).toHaveBeenCalledWith('connected');
  });
});
