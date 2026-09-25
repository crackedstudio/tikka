/**
 * status-display.spec.ts
 *
 * Unit tests for the two rendering functions in status-display.ts:
 *   - renderTable(result): ANSI-colored human-readable output
 *   - renderJson(result):  machine-readable JSON (--json mode)
 *
 * These tests guard the output shape so that runbook scripts that parse
 * the text table (e.g. grep for "Current (indexed)") or the JSON output
 * don't silently break after refactors to the rendering functions.
 */

import { renderTable, renderJson } from './status-display';
import { StatusResult } from './status.service';
import { LAG_THRESHOLD_DEFAULT } from '../health/health.constants';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    timestamp: '2024-01-15T10:00:00.000Z',
    indexer: {
      current_ledger: 1000,
      horizon_ledger: 1002,
      lag_ledgers: 2,
      mode: 'RUNNING',
      checkpoint: {
        sequence: 1000,
        ledger_hash: 'abc123def456',
        processed_event_count: 42,
        saved_at: '2024-01-15T09:59:00.000Z',
        version: 1,
      },
    },
    events: {
      total_processed: 42,
      last_24h: 10,
      last_processed_at: '2024-01-15T09:58:00.000Z',
    },
    dlq: { total: 0 },
    cache: { status: 'ok', latency_ms: 3 },
    db: {
      status: 'ok',
      pool: { total: 5, idle: 5, waiting: 0 },
    },
    warnings: [],
    ...overrides,
  };
}

/** Strip ANSI escape codes for plain-text assertions. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── renderJson ────────────────────────────────────────────────────────────────

describe('renderJson', () => {
  it('returns valid JSON', () => {
    const result = makeResult();
    expect(() => JSON.parse(renderJson(result))).not.toThrow();
  });

  it('round-trips all top-level keys', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));

    expect(parsed).toHaveProperty('timestamp', result.timestamp);
    expect(parsed).toHaveProperty('indexer');
    expect(parsed).toHaveProperty('events');
    expect(parsed).toHaveProperty('dlq');
    expect(parsed).toHaveProperty('cache');
    expect(parsed).toHaveProperty('db');
    expect(parsed).toHaveProperty('warnings');
  });

  it('preserves indexer section fields for runbook parsers', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));

    expect(parsed.indexer.current_ledger).toBe(1000);
    expect(parsed.indexer.horizon_ledger).toBe(1002);
    expect(parsed.indexer.lag_ledgers).toBe(2);
    expect(parsed.indexer.mode).toBe('RUNNING');
  });

  it('preserves checkpoint section when present', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));

    expect(parsed.indexer.checkpoint).not.toBeNull();
    expect(parsed.indexer.checkpoint.sequence).toBe(1000);
    expect(parsed.indexer.checkpoint.ledger_hash).toBe('abc123def456');
    expect(parsed.indexer.checkpoint.processed_event_count).toBe(42);
    expect(parsed.indexer.checkpoint.saved_at).toBe('2024-01-15T09:59:00.000Z');
    expect(parsed.indexer.checkpoint.version).toBe(1);
  });

  it('emits null checkpoint when no checkpoint exists', () => {
    const result = makeResult({ indexer: { ...makeResult().indexer, checkpoint: null } });
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.indexer.checkpoint).toBeNull();
  });

  it('preserves events section', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));

    expect(parsed.events.total_processed).toBe(42);
    expect(parsed.events.last_24h).toBe(10);
    expect(parsed.events.last_processed_at).toBe('2024-01-15T09:58:00.000Z');
  });

  it('preserves dlq.total', () => {
    const result = makeResult({ dlq: { total: 7 } });
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.dlq.total).toBe(7);
  });

  it('preserves cache section', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.cache.status).toBe('ok');
    expect(parsed.cache.latency_ms).toBe(3);
  });

  it('preserves cache.status="error" and null latency', () => {
    const result = makeResult({ cache: { status: 'error', latency_ms: null } });
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.cache.status).toBe('error');
    expect(parsed.cache.latency_ms).toBeNull();
  });

  it('preserves db section including pool stats', () => {
    const result = makeResult();
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.db.status).toBe('ok');
    expect(parsed.db.pool).toEqual({ total: 5, idle: 5, waiting: 0 });
  });

  it('preserves db.pool as null when unavailable', () => {
    const result = makeResult({ db: { status: 'error', pool: null } });
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.db.status).toBe('error');
    expect(parsed.db.pool).toBeNull();
  });

  it('preserves warnings array', () => {
    const result = makeResult({
      warnings: ['Database is unreachable. Check connection string and DB service.'],
    });
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toBe('Database is unreachable. Check connection string and DB service.');
  });

  it('emits pretty-printed JSON (2-space indent)', () => {
    const result = makeResult();
    const json = renderJson(result);
    // Pretty-printing produces newlines and leading spaces
    expect(json).toContain('\n  "timestamp"');
  });
});

// ── renderTable ───────────────────────────────────────────────────────────────

describe('renderTable', () => {
  it('includes a header line containing the service name', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Tikka Indexer Status');
  });

  it('includes the timestamp', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('2024-01-15T10:00:00.000Z');
  });

  // Ledger section
  it('includes Current (indexed) ledger number', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Current (indexed)');
    expect(plain).toContain('1000');
  });

  it('includes Horizon (latest) ledger number', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Horizon (latest)');
    expect(plain).toContain('1002');
  });

  it('includes lag_ledgers', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Lag');
    expect(plain).toContain('2');
  });

  it('includes mode label', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Mode');
    expect(plain).toContain('RUNNING');
  });

  it('displays n/a for null mode', () => {
    const result = makeResult({ indexer: { ...makeResult().indexer, mode: null } });
    const plain = stripAnsi(renderTable(result));
    expect(plain).toContain('n/a');
  });

  it('shows DEGRADED warning lines when mode is DEGRADED', () => {
    const result = makeResult({ indexer: { ...makeResult().indexer, mode: 'DEGRADED' } });
    const plain = stripAnsi(renderTable(result));
    expect(plain).toContain('Ingestion paused');
    expect(plain).toContain('integrity violation');
  });

  // Checkpoint section
  it('includes Checkpoint section with sequence and hash', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Checkpoint');
    expect(plain).toContain('Sequence');
    expect(plain).toContain('1000');
    expect(plain).toContain('abc123def456');
  });

  it('includes processed event count in Checkpoint section', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Events processed');
    expect(plain).toContain('42');
  });

  it('includes checkpoint saved_at timestamp', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('2024-01-15T09:59:00.000Z');
  });

  it('does not render Checkpoint section when checkpoint is null', () => {
    const result = makeResult({ indexer: { ...makeResult().indexer, checkpoint: null } });
    const plain = stripAnsi(renderTable(result));
    expect(plain).not.toContain('Checkpoint');
  });

  // Events section
  it('includes Events section with total and last 24h counts', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Events');
    expect(plain).toContain('Total processed');
    expect(plain).toContain('Last 24 h');
    expect(plain).toContain('Last processed at');
    expect(plain).toContain('2024-01-15T09:58:00.000Z');
  });

  it('shows n/a for null last_processed_at', () => {
    const result = makeResult({
      events: { total_processed: 0, last_24h: 0, last_processed_at: null },
    });
    const plain = stripAnsi(renderTable(result));
    expect(plain).toContain('n/a');
  });

  // DLQ section
  it('includes DLQ section', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('DLQ');
    expect(plain).toContain('Total size');
  });

  // Cache section
  it('includes Cache section with status and latency', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Cache');
    expect(plain).toContain('Status');
    expect(plain).toContain('ok');
    expect(plain).toContain('Latency');
    expect(plain).toContain('3 ms');
  });

  it('shows n/a for null cache latency', () => {
    const result = makeResult({ cache: { status: 'ok', latency_ms: null } });
    const plain = stripAnsi(renderTable(result));
    // "n/a" should appear somewhere in the cache area
    expect(plain).toContain('n/a');
  });

  // DB section
  it('includes Database section with pool stats', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).toContain('Database');
    expect(plain).toContain('Pool');
    expect(plain).toContain('5 / 5 / 0');
  });

  it('shows n/a for null pool', () => {
    const result = makeResult({ db: { status: 'ok', pool: null } });
    const plain = stripAnsi(renderTable(result));
    expect(plain).toContain('n/a');
  });

  // Warnings section
  it('includes Warnings section when warnings are present', () => {
    const result = makeResult({
      warnings: [
        'Database is unreachable. Check connection string and DB service.',
        `Indexer lag is high (> ${LAG_THRESHOLD_DEFAULT} ledgers).`,
      ],
    });
    const plain = stripAnsi(renderTable(result));
    expect(plain).toContain('Warnings');
    expect(plain).toContain('Database is unreachable. Check connection string and DB service.');
    expect(plain).toContain(`Indexer lag is high (> ${LAG_THRESHOLD_DEFAULT} ledgers).`);
  });

  it('does not render Warnings section when there are no warnings', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    expect(plain).not.toContain('Warnings');
  });

  // Separator / structure
  it('opens and closes with horizontal separator lines', () => {
    const plain = stripAnsi(renderTable(makeResult()));
    const separators = plain.split('\n').filter(line => /^─+$/.test(line));
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  // Raw output still contains ANSI codes (not stripped)
  it('includes ANSI escape codes in raw output', () => {
    const raw = renderTable(makeResult());
    // eslint-disable-next-line no-control-regex
    expect(raw).toMatch(/\x1b\[[0-9;]*m/);
  });
});
