import {
  parseArgs,
  applyFilters,
  summarise,
  formatSummary,
  ArgumentError,
  type DlqEntryLike,
} from './dlq-replay.filters';

/**
 * Tests for DLQ replay filtering and dry-run summary (issue #1109).
 *
 * The acceptance criterion is that dry-run reports *accurately*. These assert
 * the summary matches the filtered set exactly, since a summary that disagrees
 * with what a real replay would touch is worse than none.
 */

const MAX_RETRIES = 3;

function entry(over: Partial<DlqEntryLike> = {}): DlqEntryLike {
  return {
    id: 'id-1',
    eventType: 'TicketPurchased',
    ledger: 100,
    retryCount: 0,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    ...over,
  };
}

describe('parseArgs', () => {
  it('defaults to a real run with no filters', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, filters: {}, unknown: [] });
  });

  it('recognises --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('accepts --type in both space and equals form', () => {
    expect(parseArgs(['--type', 'A']).filters.eventTypes).toEqual(['A']);
    expect(parseArgs(['--type=A']).filters.eventTypes).toEqual(['A']);
  });

  it('accepts comma-separated and repeated --type', () => {
    expect(parseArgs(['--type', 'A,B']).filters.eventTypes).toEqual(['A', 'B']);
    expect(parseArgs(['--type', 'A', '--type', 'B']).filters.eventTypes).toEqual(['A', 'B']);
  });

  it('parses --since and --until', () => {
    const p = parseArgs(['--since', '2026-07-01', '--until', '2026-07-31']);
    expect(p.filters.since?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(p.filters.until?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('rejects an invalid date', () => {
    expect(() => parseArgs(['--since', 'yesterday'])).toThrow(ArgumentError);
  });

  it('rejects an inverted time range', () => {
    expect(() => parseArgs(['--since', '2026-07-31', '--until', '2026-07-01'])).toThrow(
      /--since must be earlier/,
    );
  });

  it('rejects a flag missing its value', () => {
    expect(() => parseArgs(['--type'])).toThrow(ArgumentError);
    // A following flag must not be swallowed as the value.
    expect(() => parseArgs(['--type', '--dry-run'])).toThrow(ArgumentError);
  });

  it('collects unknown flags instead of ignoring them', () => {
    // A mistyped --dry-runn falling through to a real replay is the accident
    // this whole flag exists to prevent.
    expect(parseArgs(['--dry-runn']).unknown).toEqual(['--dry-runn']);
    expect(parseArgs(['--dry-runn']).dryRun).toBe(false);
  });
});

describe('applyFilters', () => {
  const entries = [
    entry({ id: 'a', eventType: 'TicketPurchased', createdAt: new Date('2026-07-01T00:00:00Z') }),
    entry({ id: 'b', eventType: 'RaffleCreated', createdAt: new Date('2026-07-15T00:00:00Z') }),
    entry({ id: 'c', eventType: 'TicketPurchased', createdAt: new Date('2026-07-30T00:00:00Z') }),
  ];

  it('returns everything with no filters', () => {
    expect(applyFilters(entries, {})).toHaveLength(3);
  });

  it('filters by event type', () => {
    expect(applyFilters(entries, { eventTypes: ['RaffleCreated'] }).map((e) => e.id)).toEqual(['b']);
  });

  it('filters by multiple event types', () => {
    expect(applyFilters(entries, { eventTypes: ['RaffleCreated', 'TicketPurchased'] })).toHaveLength(3);
  });

  it('treats an empty type list as no filter', () => {
    expect(applyFilters(entries, { eventTypes: [] })).toHaveLength(3);
  });

  it('filters by since, inclusive of the boundary', () => {
    const out = applyFilters(entries, { since: new Date('2026-07-15T00:00:00Z') });
    expect(out.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('filters by until, inclusive of the boundary', () => {
    const out = applyFilters(entries, { until: new Date('2026-07-15T00:00:00Z') });
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('combines type and time filters', () => {
    const out = applyFilters(entries, {
      eventTypes: ['TicketPurchased'],
      since: new Date('2026-07-10T00:00:00Z'),
    });
    expect(out.map((e) => e.id)).toEqual(['c']);
  });
});

describe('summarise', () => {
  const now = new Date('2026-07-31T00:00:00Z');

  it('handles an empty set without inventing dates', () => {
    const s = summarise([], MAX_RETRIES, now);
    expect(s).toEqual({ total: 0, exhausted: 0, pending: 0, byType: [] });
    expect(s.oldest).toBeUndefined();
  });

  it('splits exhausted from pending on the retry ceiling', () => {
    const s = summarise(
      [entry({ retryCount: 3 }), entry({ retryCount: 2 }), entry({ retryCount: 5 })],
      MAX_RETRIES,
      now,
    );
    expect(s.exhausted).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.exhausted + s.pending).toBe(s.total);
  });

  it('counts by type, highest first', () => {
    const s = summarise(
      [
        entry({ eventType: 'A' }),
        entry({ eventType: 'B' }),
        entry({ eventType: 'B' }),
        entry({ eventType: 'C' }),
      ],
      MAX_RETRIES,
      now,
    );
    expect(s.byType[0]).toEqual({ eventType: 'B', count: 2 });
    // Ties break by name so two runs of the same data print identically.
    expect(s.byType.slice(1)).toEqual([
      { eventType: 'A', count: 1 },
      { eventType: 'C', count: 1 },
    ]);
  });

  it('reports the true oldest and newest regardless of input order', () => {
    const s = summarise(
      [
        entry({ createdAt: new Date('2026-07-20T00:00:00Z') }),
        entry({ createdAt: new Date('2026-07-01T00:00:00Z') }),
        entry({ createdAt: new Date('2026-07-25T00:00:00Z') }),
      ],
      MAX_RETRIES,
      now,
    );
    expect(s.oldest?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(s.newest?.toISOString()).toBe('2026-07-25T00:00:00.000Z');
    expect(s.oldestAgeHours).toBe(720); // 30 days
  });

  it('total always equals the number of entries passed in', () => {
    // The core accuracy guarantee: the summary describes exactly the filtered
    // population the replay would act on.
    const entries = Array.from({ length: 17 }, (_, i) => entry({ id: `e${i}` }));
    expect(summarise(entries, MAX_RETRIES, now).total).toBe(17);
  });
});

describe('formatSummary', () => {
  it('always states the active filter', () => {
    // "0 entries" means something very different with and without a filter.
    expect(formatSummary(summarise([], MAX_RETRIES), {})).toContain('none (all entries)');
    expect(formatSummary(summarise([], MAX_RETRIES), { eventTypes: ['A'] })).toContain('type in [A]');
  });

  it('says so plainly when nothing matches', () => {
    expect(formatSummary(summarise([], MAX_RETRIES), {})).toContain('No DLQ entries match.');
  });

  it('renders totals and the per-type table', () => {
    const out = formatSummary(
      summarise([entry({ eventType: 'A' }), entry({ eventType: 'A' })], MAX_RETRIES),
      {},
    );
    expect(out).toContain('Total matching:  2');
    expect(out).toMatch(/EVENT TYPE\s+COUNT/);
    expect(out).toMatch(/A\s+2/);
  });
});
