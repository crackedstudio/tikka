import { main, parseArgs } from './status.command';
import { fetchStatus, StatusResult } from './status.service';
import { renderJson, renderTable } from './status-display';

jest.mock('./status.service', () => ({ fetchStatus: jest.fn() }));
jest.mock('./status-display', () => ({
  renderJson: jest.fn((result) => JSON.stringify(result)),
  renderTable: jest.fn(() => 'STATUS TABLE'),
}));

const mockFetchStatus = fetchStatus as jest.MockedFunction<typeof fetchStatus>;
const mockRenderJson = renderJson as jest.MockedFunction<typeof renderJson>;
const mockRenderTable = renderTable as jest.MockedFunction<typeof renderTable>;

function snapshot(db: 'ok' | 'error' = 'ok', cache: 'ok' | 'error' = 'ok'): StatusResult {
  return {
    timestamp: '2026-09-25T10:00:00.000Z',
    indexer: {
      current_ledger: 100,
      horizon_ledger: 100,
      lag_ledgers: 0,
      mode: null,
      checkpoint: null,
    },
    events: { total_processed: 1, last_24h: 1, last_processed_at: null },
    dlq: { total: 0 },
    cache: { status: cache, latency_ms: cache === 'ok' ? 1 : null },
    db: { status: db, pool: null },
    warnings: db === 'error' || cache === 'error' ? ['Dependency unavailable'] : [],
  };
}

describe('status command', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    jest.clearAllMocks();
    log = jest.spyOn(console, 'log').mockImplementation();
    error = jest.spyOn(console, 'error').mockImplementation();
    process.exitCode = undefined;
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('parses defaults, JSON, watch intervals, and rejects malformed arguments', () => {
    expect(parseArgs([])).toEqual({ jsonMode: false, watchInterval: null });
    expect(parseArgs(['--json', '--watch'])).toEqual({ jsonMode: true, watchInterval: 3000 });
    expect(parseArgs(['--watch', '5000', '--json'])).toEqual({
      jsonMode: true,
      watchInterval: 5000,
    });
    expect(() => parseArgs(['--watch', '-1'])).toThrow('positive integer');
    expect(() => parseArgs(['--unknown'])).toThrow('Unknown status option');
  });

  it('runs the default table view and exits successfully when healthy', async () => {
    const result = snapshot();
    mockFetchStatus.mockResolvedValue(result);

    await main([]);

    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
    expect(mockRenderTable).toHaveBeenCalledWith(result);
    expect(mockRenderJson).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('STATUS TABLE');
    expect(process.exitCode).toBe(0);
  });

  it('prints JSON without an ANSI table', async () => {
    const result = snapshot();
    mockFetchStatus.mockResolvedValue(result);

    await main(['--json']);

    expect(mockRenderJson).toHaveBeenCalledWith(result);
    expect(mockRenderTable).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(JSON.stringify(result));
    expect(process.exitCode).toBe(0);
  });

  it.each([
    ['database', 'error', 'ok'],
    ['Redis', 'ok', 'error'],
  ] as const)('prints the %s failure report and exits non-zero', async (_name, db, cache) => {
    const result = snapshot(db, cache);
    mockFetchStatus.mockResolvedValue(result);

    await main(['--json']);

    expect(mockRenderJson).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(JSON.stringify(result));
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('exits non-zero for an actionable warning even when dependencies respond', async () => {
    mockFetchStatus.mockResolvedValue({ ...snapshot(), warnings: ['Indexer lag is high'] });

    await main([]);

    expect(process.exitCode).toBe(1);
  });

  it('handles an unexpected fetch failure without forcing process.exit', async () => {
    mockFetchStatus.mockRejectedValue(new Error('database timeout'));

    await main([]);

    expect(error).toHaveBeenCalledWith('Status fetch failed:', expect.any(Error));
    expect(process.exitCode).toBe(1);
  });
});
