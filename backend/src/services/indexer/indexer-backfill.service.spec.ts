import { ConfigService } from '@nestjs/config';
import * as fc from 'fast-check';
import { BackfillLock, BackfillLockError } from './backfill-lock';
import { HorizonClientService } from './horizon-client.service';
import { IndexerBackfillService } from './indexer-backfill.service';
import { HorizonLedgerData } from './indexer-backfill.types';
import { IndexerService } from './indexer.service';

// fast-check configuration — reduced for faster CI runs
fc.configureGlobal({ numRuns: 20 });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLedgerData(sequence: number): HorizonLedgerData {
  return {
    sequence,
    hash: `hash-${sequence}`,
    closedAt: '2024-01-01T00:00:00Z',
    transactionCount: 0,
    transactions: [],
  };
}

function makeService(opts: {
  maxRange?: number;
  retryCount?: number;
  retryDelayMs?: number;
} = {}): {
  service: IndexerBackfillService;
  lock: BackfillLock;
  horizonClient: jest.Mocked<HorizonClientService>;
  indexer: jest.Mocked<IndexerService>;
  config: jest.Mocked<ConfigService>;
  logMessages: { level: string; message: string }[];
} {
  const { maxRange = 10000, retryCount = 3, retryDelayMs = 0 } = opts;

  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'BACKFILL_MAX_RANGE') return maxRange;
      if (key === 'BACKFILL_RETRY_COUNT') return retryCount;
      if (key === 'BACKFILL_RETRY_DELAY_MS') return retryDelayMs;
      return defaultValue;
    }),
    getOrThrow: jest.fn(),
  } as unknown as jest.Mocked<ConfigService>;

  const lock = new BackfillLock();

  const horizonClient = {
    fetchLedger: jest.fn(),
  } as unknown as jest.Mocked<HorizonClientService>;

  const indexer = {
    submitLedger: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IndexerService>;

  const service = new IndexerBackfillService(
    config,
    lock,
    horizonClient,
    indexer,
  );

  // Capture log messages for property tests
  const logMessages: { level: string; message: string }[] = [];
  const logger = (service as unknown as Record<string, unknown>)['logger'] as {
    log: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
  };
  jest.spyOn(logger, 'log').mockImplementation((msg: string) => {
    logMessages.push({ level: 'log', message: msg });
  });
  jest.spyOn(logger, 'debug').mockImplementation((msg: string) => {
    logMessages.push({ level: 'debug', message: msg });
  });
  jest.spyOn(logger, 'warn').mockImplementation((msg: string) => {
    logMessages.push({ level: 'warn', message: msg });
  });

  return { service, lock, horizonClient, indexer, config, logMessages };
}

// ── Property 3: Invalid inputs are rejected before any Horizon call ───────────
// Feature: indexer-backfill, Property 3: Invalid inputs are rejected before any Horizon call
// Validates: Requirements 2.1, 2.2, 2.3, 2.4

describe('Property 3: Invalid inputs are rejected before any Horizon call', () => {
  it('rejects non-positive-integer startLedger', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.double({ min: 0.001, max: 1e6, noNaN: true }).filter((n) => !Number.isInteger(n)),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
        ),
        fc.integer({ min: 1, max: 10000 }),
        async (badStart, validEnd) => {
          const { service, horizonClient } = makeService();
          await expect(
            service.backfill(badStart as number, validEnd),
          ).rejects.toThrow(/startLedger must be a positive integer/);
          expect(horizonClient.fetchLedger).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it('rejects non-positive-integer endLedger', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.double({ min: 0.001, max: 1e6, noNaN: true }).filter((n) => !Number.isInteger(n)),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
        ),
        async (validStart, badEnd) => {
          const { service, horizonClient } = makeService();
          await expect(
            service.backfill(validStart, badEnd as number),
          ).rejects.toThrow(/endLedger must be a positive integer/);
          expect(horizonClient.fetchLedger).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it('rejects startLedger > endLedger', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10000 }),
        fc.integer({ min: 1 }),
        async (start, offset) => {
          const end = start - offset;
          if (end < 1) return;
          const { service, horizonClient } = makeService();
          await expect(service.backfill(start, end)).rejects.toThrow(
            /startLedger \(\d+\) must be <= endLedger \(\d+\)/,
          );
          expect(horizonClient.fetchLedger).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it('rejects ranges exceeding BACKFILL_MAX_RANGE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        async (maxRange, excess) => {
          const startLedger = 1;
          const endLedger = startLedger + maxRange + excess - 1;
          const { service, horizonClient } = makeService({ maxRange });
          await expect(service.backfill(startLedger, endLedger)).rejects.toThrow(
            /exceeds BACKFILL_MAX_RANGE/,
          );
          expect(horizonClient.fetchLedger).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it('accepts a range of exactly BACKFILL_MAX_RANGE ledgers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 100 }),
        async (maxRange, startLedger) => {
          const endLedger = startLedger + maxRange - 1;
          const { service, horizonClient } = makeService({ maxRange });
          horizonClient.fetchLedger.mockResolvedValue(null);
          await expect(service.backfill(startLedger, endLedger)).resolves.toBeDefined();
        },
      ),
    );
  });
});

// ── Property 4: Lock is always released after backfill completes ──────────────
// Feature: indexer-backfill, Property 4: Lock is always released after backfill completes
// Validates: Requirements 3.1, 3.4

describe('Property 4: Lock is always released after backfill completes', () => {
  it('releases lock after successful backfill', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const { service, lock, horizonClient } = makeService();
          horizonClient.fetchLedger.mockResolvedValue(null);
          await service.backfill(startLedger, endLedger);
          expect(lock.isLocked()).toBe(false);
        },
      ),
    );
  });

  it('releases lock even when runBackfill throws', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const { service, lock } = makeService();

          (service as unknown as Record<string, unknown>)['runBackfill'] =
            jest.fn().mockRejectedValue(new Error('Simulated failure'));

          await expect(service.backfill(startLedger, endLedger)).rejects.toThrow(
            'Simulated failure',
          );
          expect(lock.isLocked()).toBe(false);
        },
      ),
    );
  });

  it('throws BackfillLockError when lock is already held', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const { service, lock } = makeService();

          lock.tryAcquire();
          expect(lock.isLocked()).toBe(true);

          await expect(service.backfill(startLedger, endLedger)).rejects.toThrow(
            BackfillLockError,
          );
          expect(lock.isLocked()).toBe(true);
          lock.release();
        },
      ),
    );
  });
});

// ── Property 1: Ledgers submitted in ascending order ─────────────────────────
// Feature: indexer-backfill, Property 1: Ledgers are submitted to the pipeline in ascending order
// Validates: Requirements 1.2, 1.3, 1.5

describe('Property 1: Ledgers are submitted to the pipeline in ascending order', () => {
  it('submits all ledgers in strictly ascending order with complete coverage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 9 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const { service, horizonClient, indexer } = makeService();

          horizonClient.fetchLedger.mockImplementation((seq: number) =>
            Promise.resolve(makeLedgerData(seq)),
          );

          await service.backfill(startLedger, endLedger);

          const submitted = (indexer.submitLedger as jest.Mock).mock.calls.map(
            (call) => (call[0] as { sequence: number }).sequence,
          );

          // Strictly ascending
          for (let i = 1; i < submitted.length; i++) {
            expect(submitted[i]).toBeGreaterThan(submitted[i - 1]);
          }

          // Complete coverage: every ledger in range was submitted
          const expected = Array.from(
            { length: endLedger - startLedger + 1 },
            (_, i) => startLedger + i,
          );
          expect(submitted).toEqual(expected);
        },
      ),
    );
  });
});

// ── Property 2: Summary accurately reflects processing outcomes ───────────────
// Feature: indexer-backfill, Property 2: Summary accurately reflects processing outcomes
// Validates: Requirements 1.4, 4.4

describe('Property 2: Summary accurately reflects processing outcomes', () => {
  it('processedCount + skippedCount === totalLedgers and missingLedgers is accurate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 4 }),
        // outcome per ledger: 0=success, 1=404(null), 2=transient error
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 5 }),
        async (startLedger, rangeOffset, outcomePattern) => {
          const endLedger = startLedger + rangeOffset;
          const totalLedgers = endLedger - startLedger + 1;
          const { service, horizonClient } = makeService({ retryCount: 0 });

          let callIndex = 0;
          horizonClient.fetchLedger.mockImplementation((seq: number) => {
            const outcome = outcomePattern[callIndex % outcomePattern.length];
            callIndex++;
            if (outcome === 1) return Promise.resolve(null); // 404
            if (outcome === 2) return Promise.reject(new Error('transient'));
            return Promise.resolve(makeLedgerData(seq)); // success
          });

          const summary = await service.backfill(startLedger, endLedger);

          expect(summary.totalLedgers).toBe(totalLedgers);
          expect(summary.processedCount + summary.skippedCount).toBe(totalLedgers);
          expect(summary.skippedCount).toBe(summary.missingLedgers.length);
          expect(summary.startLedger).toBe(startLedger);
          expect(summary.endLedger).toBe(endLedger);
        },
      ),
    );
  });
});

// ── Property 5: Transient errors trigger retries up to the configured limit ───
// Feature: indexer-backfill, Property 5: Transient errors trigger retries up to the configured limit
// Validates: Requirements 4.2

describe('Property 5: Transient errors trigger retries up to the configured limit', () => {
  it('calls Horizon exactly retryCount+1 times for a ledger that always fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        async (retryCount) => {
          const { service, horizonClient } = makeService({ retryCount });
          horizonClient.fetchLedger.mockRejectedValue(new Error('5xx'));

          await service.backfill(1, 1);

          expect(horizonClient.fetchLedger).toHaveBeenCalledTimes(retryCount + 1);
          jest.clearAllMocks();
        },
      ),
    );
  });
});

// ── Property 6: Missing ledgers are logged with sequence number and reason ────
// Feature: indexer-backfill, Property 6: Missing ledgers are logged with sequence number and reason
// Validates: Requirements 4.3

describe('Property 6: Missing ledgers are logged with sequence number and reason', () => {
  it('emits a warning log with sequence number and non-empty reason for each missing ledger', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 4 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const { service, horizonClient, logMessages } = makeService({ retryCount: 0 });

          // All ledgers return 404
          horizonClient.fetchLedger.mockResolvedValue(null);

          const summary = await service.backfill(startLedger, endLedger);

          for (const seq of summary.missingLedgers) {
            const warnLogs = logMessages.filter((m) => m.level === 'warn');
            const matchingLog = warnLogs.find((m) => m.message.includes(`seq=${seq}`));
            expect(matchingLog).toBeDefined();
            // Reason must be non-empty (message contains more than just the seq)
            expect(matchingLog!.message.length).toBeGreaterThan(`Missing ledger seq=${seq}: `.length);
          }
        },
      ),
    );
  });
});

// ── Property 7: Progress and completion logs contain required fields ──────────
// Feature: indexer-backfill, Property 7: Progress and completion logs contain required fields
// Validates: Requirements 5.1, 5.3, 5.4

describe('Property 7: Progress and completion logs contain required fields', () => {
  it('emits start log with startLedger/endLedger/totalLedgers and completion log with counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 4 }),
        async (startLedger, rangeOffset) => {
          const endLedger = startLedger + rangeOffset;
          const totalLedgers = endLedger - startLedger + 1;
          const { service, horizonClient, logMessages } = makeService();
          horizonClient.fetchLedger.mockResolvedValue(null);

          await service.backfill(startLedger, endLedger);

          const infoLogs = logMessages.filter((m) => m.level === 'log').map((m) => m.message);

          // Start log
          const startLog = infoLogs.find(
            (m) =>
              m.includes(`startLedger=${startLedger}`) &&
              m.includes(`endLedger=${endLedger}`) &&
              m.includes(`totalLedgers=${totalLedgers}`),
          );
          expect(startLog).toBeDefined();

          // Completion log
          const completionLog = infoLogs.find(
            (m) =>
              m.includes('processedCount=') &&
              m.includes('skippedCount=') &&
              m.includes('elapsedMs='),
          );
          expect(completionLog).toBeDefined();
        },
      ),
    );
  });

  it('emits at least one progress log per 100 ledgers for runs >= 100 ledgers', async () => {
    // Use a fixed range of exactly 100 ledgers to keep the test fast
    const startLedger = 1;
    const endLedger = 100;
    const { service, horizonClient, logMessages } = makeService();
    horizonClient.fetchLedger.mockResolvedValue(null);

    await service.backfill(startLedger, endLedger);

    const progressLogs = logMessages
      .filter((m) => m.level === 'log')
      .filter((m) => m.message.includes('progress'));

    expect(progressLogs.length).toBeGreaterThanOrEqual(1);
  });
});
