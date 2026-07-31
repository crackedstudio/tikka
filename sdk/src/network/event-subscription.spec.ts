import { rpc } from '@stellar/stellar-sdk';
import {
  EventGapWarning,
  subscribeToEvents,
} from './event-subscription';

function mockEvent(id: string, ledger: number): rpc.Api.EventResponse {
  return {
    id,
    type: 'contract',
    ledger,
    ledgerClosedAt: '2024-01-01T00:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: `tx-${id}`,
    topic: [],
    value: {} as rpc.Api.EventResponse['value'],
  };
}

function mockResponse(
  events: rpc.Api.EventResponse[],
  overrides: Partial<rpc.Api.GetEventsResponse> = {},
): rpc.Api.GetEventsResponse {
  const latestLedger = overrides.latestLedger ?? (events.at(-1)?.ledger ?? 100);
  return {
    events,
    cursor: overrides.cursor ?? events.at(-1)?.id ?? '',
    latestLedger,
    oldestLedger: overrides.oldestLedger ?? 1,
    latestLedgerCloseTime: '2024-01-01T00:00:00Z',
    oldestLedgerCloseTime: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor timed out'));
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('subscribeToEvents', () => {
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: ['CABC'] }];

  it('resumes after a mid-stream connection failure without missing events', async () => {
    const e1 = mockEvent('evt-1', 10);
    const e2 = mockEvent('evt-2', 11);
    const e3 = mockEvent('evt-3', 12);
    const e4 = mockEvent('evt-4', 13);

    const cursorsSeen: string[] = [];
    let call = 0;
    const sleepResolvers: Array<() => void> = [];

    const getEvents = jest.fn(async (request: rpc.Api.GetEventsRequest) => {
      cursorsSeen.push('cursor' in request ? String(request.cursor ?? '') : '');
      call++;
      if (call === 1) {
        return mockResponse([e1, e2], { cursor: 'page-1' });
      }
      if (call === 2) {
        const err = new Error('ECONNRESET');
        (err as NodeJS.ErrnoException).code = 'ECONNRESET';
        throw err;
      }
      if (call === 3) {
        return mockResponse([e3, e4], { cursor: 'page-2' });
      }
      return mockResponse([]);
    });

    const received: string[] = [];
    const reconnects: number[] = [];

    const handle = subscribeToEvents({
      getEvents,
      filters,
      pollIntervalMs: 1,
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
      sleep: () =>
        new Promise<void>((resolve) => {
          sleepResolvers.push(resolve);
        }),
      onEvent: async (event) => {
        received.push(event.id);
      },
      onReconnect: (attempt) => reconnects.push(attempt),
    });

    await waitFor(() => received.length === 2 && sleepResolvers.length >= 1);
    expect(received).toEqual(['evt-1', 'evt-2']);

    // Advance past the successful-poll sleep so the next getEvents fails.
    sleepResolvers.shift()!();
    await waitFor(() => reconnects.length === 1 && sleepResolvers.length >= 1);
    expect(reconnects).toEqual([1]);

    // Advance past reconnect backoff; resume should use the page cursor.
    sleepResolvers.shift()!();
    await waitFor(() => received.length === 4);
    expect(received).toEqual(['evt-1', 'evt-2', 'evt-3', 'evt-4']);
    expect(cursorsSeen[2]).toBe('page-1');
    expect(new Set(received).size).toBe(4);

    handle.stop();
    while (sleepResolvers.length > 0) {
      sleepResolvers.shift()!();
    }
    await handle.done;
  });

  it('tracks resume cursor from the last processed event', async () => {
    const e1 = mockEvent('evt-a', 5);
    const sleepResolvers: Array<() => void> = [];

    const handle = subscribeToEvents({
      getEvents: jest
        .fn()
        .mockResolvedValueOnce(mockResponse([e1], { cursor: 'cur-a' }))
        .mockResolvedValue(mockResponse([])),
      filters,
      pollIntervalMs: 1,
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
      sleep: () =>
        new Promise<void>((resolve) => {
          sleepResolvers.push(resolve);
        }),
      onEvent: async () => {},
    });

    await waitFor(() => handle.getLastProcessedEventId() === 'evt-a');
    expect(handle.getResumeCursor()).toBe('cur-a');

    handle.stop();
    while (sleepResolvers.length > 0) {
      sleepResolvers.shift()!();
    }
    await handle.done;
  });

  it('surfaces a gap warning when retention no longer covers the resume cursor', async () => {
    const warnings: EventGapWarning[] = [];
    let call = 0;
    const sleepResolvers: Array<() => void> = [];

    const handle = subscribeToEvents({
      getEvents: jest.fn(async () => {
        call++;
        if (call === 1) {
          return mockResponse([mockEvent('evt-gap', 40)], {
            oldestLedger: 1,
            latestLedger: 40,
            cursor: 'evt-gap',
          });
        }
        return mockResponse([], {
          oldestLedger: 45,
          latestLedger: 55,
          cursor: 'evt-gap',
        });
      }),
      filters,
      pollIntervalMs: 1,
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
      sleep: () =>
        new Promise<void>((resolve) => {
          sleepResolvers.push(resolve);
        }),
      onEvent: async () => {},
      onGapWarning: (w) => warnings.push(w),
    });

    await waitFor(() => sleepResolvers.length >= 1);
    sleepResolvers.shift()!();
    await waitFor(() => warnings.length >= 1);

    handle.stop();
    while (sleepResolvers.length > 0) {
      sleepResolvers.shift()!();
    }
    await handle.done;

    expect(warnings[0].lastProcessedLedger).toBe(40);
    expect(warnings[0].message).toContain('retention');
  });

  it('surfaces a gap warning when getEvents rejects for a stale cursor', async () => {
    const warnings: EventGapWarning[] = [];
    const sleepResolvers: Array<() => void> = [];

    const handle = subscribeToEvents({
      getEvents: jest.fn(async () => {
        throw new Error('startLedger is before oldest ledger');
      }),
      filters,
      initialCursor: 'cur-stale',
      pollIntervalMs: 1,
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
      sleep: () =>
        new Promise<void>((resolve) => {
          sleepResolvers.push(resolve);
        }),
      onEvent: async () => {},
      onGapWarning: (w) => warnings.push(w),
    });

    await waitFor(() => warnings.length >= 1);
    expect(warnings[0].resumeCursor).toBe('cur-stale');
    expect(warnings[0].message).toMatch(/oldest ledger|Cannot resume/i);

    handle.stop();
    while (sleepResolvers.length > 0) {
      sleepResolvers.shift()!();
    }
    await handle.done;
  });
});
