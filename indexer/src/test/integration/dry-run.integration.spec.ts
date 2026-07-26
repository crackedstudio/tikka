import { LedgerPollerService } from '../../ingestor/ledger-poller.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('LedgerPoller Dry-Run (Integration)', () => {
  let ledgerPoller: LedgerPollerService;
  let metrics: MetricsService;

  beforeAll(() => {
    // Mock ConfigService
    const configService = {
      get: (key: string, def?: any) => {
        switch (key) {
          case 'HORIZON_URL':
            return 'https://mock-horizon.local';
          case 'TIKKA_CONTRACT_ID':
            return 'contract-1';
          case 'INGESTION_BATCH_SIZE':
            return 25;
          case 'REORG_SAFETY_DEPTH':
            return 5;
          default:
            return def;
        }
      },
    } as any;

    // Cursor manager stub
    const cursorManager = {
      getCursor: jest.fn().mockResolvedValue({ lastPagingToken: 'now', lastLedger: 0, lastCheckpoint: { processedEventCount: 0 } }),
      getStatus: jest.fn().mockReturnValue({ mode: 'OK', lastCheckpoint: { processedEventCount: 0 } }),
      saveCursor: jest.fn(),
      checkForReorg: jest.fn().mockResolvedValue(null),
    } as any;

    // Simple event parser that reads JSON from raw.value
    const eventParser = {
      parse: (raw: any) => {
        try {
          const obj = typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value;
          return obj as any;
        } catch (e) {
          return null;
        }
      },
    } as any;

    // Dry-run flag
    const dryRun = { enabled: true } as any;

    // Dispatcher: don't perform DB writes in this integration test; pretend all succeed
    const dispatcher = {
      dispatchBatch: jest.fn().mockImplementation(async (items: any[]) => items.map((it) => ({ handlerName: 'mock', eventId: 'id', eventType: it.event.type, outcome: 'skipped', durationMs: 1 }))),
    } as any;

    // Minimal metrics service using real implementation (needs HealthService stub)
    const health = { report: jest.fn() } as any;
    metrics = new MetricsService(health);

    const reorgRollback = { rollback: jest.fn() } as any;
    const pipeline = { apply: jest.fn() } as any;

    ledgerPoller = new LedgerPollerService(
      configService,
      cursorManager,
      eventParser,
      dryRun,
      dispatcher,
      metrics,
      reorgRollback,
      pipeline,
    );

    // Replace horizon server with a mock that streams 100 synthetic events.
    const mockHorizon = {
      events: () => ({
        cursor: (_: string) => ({
          stream: (handlers: any) => {
            // Fire 100 synthetic events asynchronously
            setImmediate(() => {
              const counts = { RaffleCreated: 40, TicketPurchased: 40, RaffleFinalized: 20 };
              let ledger = 1000;
              for (const [type, count] of Object.entries(counts)) {
                for (let i = 0; i < count; i++) {
                  ledger++;
                  const raw = {
                    id: `${type}-${i}`,
                    ledger: String(ledger),
                    paging_token: `${ledger}`,
                    contract_id: 'contract-1',
                    type: 'contract',
                    value: JSON.stringify({ type, raffle_id: 1, ticket_ids: [1], total_paid: '1', winner: 'winner1', winning_ticket_id: 1, prize_amount: '10' }),
                  };
                  handlers.onmessage(raw);
                }
              }
            });

            return () => {};
          },
        }),
      }),
    };

    // Inject mock horizon server
    (ledgerPoller as any).horizonServer = mockHorizon as any;
  });

  it('processes 100 events in dry-run without touching DB and reports correct metrics', async () => {
    // Start the SSE stream from a cursor (private method access)
    (ledgerPoller as any).startSse('now');

    // Wait for the ledgerPoller chain to finish processing queued events
    // The internal chain promise holds the processing state; wait a tick and then access it.
    await new Promise((r) => setTimeout(r, 200));

    // Ensure cursor save was not called (dry-run should not persist cursor)
    const cursorManager = (ledgerPoller as any).cursorManager;
    expect(cursorManager.saveCursor).not.toHaveBeenCalled();

    // Read metrics and assert counts
    const metricsText = await metrics.getMetrics();

    const parseMetric = (name: string, label: string) => {
      const re = new RegExp(`^${name}\{event_type=\\"${label}\\"\} (\\d+)$`, 'm');
      const m = metricsText.match(re);
      return m ? Number(m[1]) : 0;
    };

    const raffleCreated = parseMetric('tikka_indexer_events_processed_total', 'RaffleCreated');
    const ticketPurchased = parseMetric('tikka_indexer_events_processed_total', 'TicketPurchased');
    const raffleFinalized = parseMetric('tikka_indexer_events_processed_total', 'RaffleFinalized');

    expect(raffleCreated + ticketPurchased + raffleFinalized).toBe(100);
    expect(raffleCreated).toBe(40);
    expect(ticketPurchased).toBe(40);
    expect(raffleFinalized).toBe(20);
  });
});
