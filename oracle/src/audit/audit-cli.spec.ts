import { executeAuditCommand, AuditDb, AuditQuery, QueryResult } from './audit-cli';
import { VrfAuditRecord } from './audit.types';

interface Call {
  table: string;
  op: string;
}

function createDb(
  handler: (table: string, op: string, filters: Record<string, unknown>) => QueryResult,
): { db: AuditDb; ops: Call[] } {
  const ops: Call[] = [];
  const db: AuditDb = {
    from(table: string): AuditQuery {
      let op = 'select';
      const filters: Record<string, unknown> = {};
      const query = {
        select() {
          ops.push({ table, op: 'select' });
          return query;
        },
        insert() {
          op = 'insert';
          ops.push({ table, op: 'insert' });
          return query;
        },
        update() {
          op = 'update';
          ops.push({ table, op: 'update' });
          return query;
        },
        delete() {
          op = 'delete';
          ops.push({ table, op: 'delete' });
          return query;
        },
        upsert() {
          op = 'upsert';
          ops.push({ table, op: 'upsert' });
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        gte() {
          return query;
        },
        lte() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        single() {
          return Promise.resolve(handler(table, op, filters));
        },
        then(
          onFulfilled: (value: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(handler(table, op, filters)).then(onFulfilled, onRejected);
        },
      } as AuditQuery;
      return query;
    },
  };
  return { db, ops };
}

function record(overrides: Partial<VrfAuditRecord> = {}): VrfAuditRecord {
  return {
    id: 1,
    raffle_id: 42,
    request_id: 'req-1',
    commitment_hash: 'a'.repeat(64),
    reveal_hash: 'b'.repeat(64),
    proof: 'c'.repeat(64),
    seed: 'd'.repeat(64),
    oracle_public_key: 'e'.repeat(64),
    status: 'revealed',
    committed_at: '2026-01-02T00:00:00.000Z',
    revealed_at: '2026-01-02T00:01:00.000Z',
    ledger_sequence: 10,
    chain_hash: 'f'.repeat(64),
    tx_hash: 'g'.repeat(64),
    fee_stroops: 250,
    ...overrides,
  };
}

describe('audit CLI', () => {
  let logs: string[];
  let errors: string[];
  const io = {
    log: (message: string) => logs.push(message),
    error: (message: string) => errors.push(message),
  };

  beforeEach(() => {
    logs = [];
    errors = [];
  });

  function outputJson(): unknown {
    return JSON.parse(logs.join('\n'));
  }

  it('covers each query mode and marks a populated fee as recorded', async () => {
    const row = record();
    const anchor = {
      id: 7,
      chain_head_hash: row.chain_hash,
      record_count: 1,
      anchored_at: '2026-02-01T00:00:00.000Z',
      anchor_type: 'cli',
      external_ref: null,
    };
    const { db } = createDb((table) => {
      if (table === 'audit_chain_anchors') return { data: [anchor], error: null };
      return { data: [row], error: null, count: 4 };
    });

    const byRaffle = createDb(() => ({ data: row, error: null }));
    expect(await executeAuditCommand(['--json', 'by-raffle', '42'], byRaffle.db, io)).toBe(0);
    expect(outputJson()).toMatchObject({
      command: 'by-raffle',
      record: { feeStroops: 250, feeStatus: 'recorded' },
    });

    logs.length = 0;
    expect(
      await executeAuditCommand(
        ['--json', 'by-time', '--from', '2026-01-01T00:00:00Z', '--to', '2026-02-01T00:00:00Z'],
        db,
        io,
      ),
    ).toBe(0);
    expect(outputJson()).toMatchObject({
      command: 'by-time',
      records: [{ feeStatus: 'recorded' }],
    });

    logs.length = 0;
    expect(
      await executeAuditCommand(['--json', 'by-status', 'revealed', '--limit', '10'], db, io),
    ).toBe(0);
    expect(outputJson()).toMatchObject({ command: 'by-status', status: 'revealed' });

    logs.length = 0;
    expect(await executeAuditCommand(['--json', 'summary'], db, io)).toBe(0);
    expect(outputJson()).toMatchObject({
      command: 'summary',
      total: 4,
      committed: 4,
      revealed: 4,
      abandoned: 4,
    });

    logs.length = 0;
    expect(await executeAuditCommand(['--json', 'verify-chain'], db, io)).toBe(1);
    expect(outputJson()).toMatchObject({ command: 'verify-chain', valid: false, total: 1 });

    logs.length = 0;
    expect(await executeAuditCommand(['--json', 'anchor-verify'], db, io)).toBe(0);
    expect(outputJson()).toMatchObject({ command: 'anchor-verify' });

    logs.length = 0;
    expect(await executeAuditCommand(['--json', 'anchor-history', '--limit', '5'], db, io)).toBe(0);
    expect(outputJson()).toMatchObject({ command: 'anchor-history' });
  });

  it('reports an empty result for each list query', async () => {
    const { db } = createDb(() => ({ data: [], error: null, count: 0 }));

    expect(await executeAuditCommand(['by-time', '--from', '2026-01-01T00:00:00Z'], db, io)).toBe(
      0,
    );
    expect(logs.join('\n')).toContain('No records found matching the criteria.');

    logs.length = 0;
    expect(await executeAuditCommand(['by-status', 'committed'], db, io)).toBe(0);
    expect(logs.join('\n')).toContain('No records found with status: committed');

    logs.length = 0;
    expect(await executeAuditCommand(['--json', 'summary'], db, io)).toBe(0);
    expect(outputJson()).toMatchObject({ total: 0, committed: 0, revealed: 0, abandoned: 0 });

    logs.length = 0;
    expect(await executeAuditCommand(['verify-chain'], db, io)).toBe(0);
    expect(logs.join('\n')).toContain('No records to verify.');

    logs.length = 0;
    expect(await executeAuditCommand(['anchor-history'], db, io)).toBe(0);
    expect(logs.join('\n')).toContain('No anchors found.');
  });

  it('rejects a malformed filter without querying writes', async () => {
    const { db, ops } = createDb(() => ({ data: null, error: { message: 'unused' } }));

    expect(await executeAuditCommand(['by-raffle', 'abc'], db, io)).toBe(1);
    expect(errors.join('\n')).toContain('Invalid raffle ID');

    errors.length = 0;
    expect(await executeAuditCommand(['by-raffle', '0'], db, io)).toBe(1);

    errors.length = 0;
    expect(await executeAuditCommand(['by-status', 'nope'], db, io)).toBe(1);
    expect(errors.join('\n')).toContain('Invalid status');

    errors.length = 0;
    expect(await executeAuditCommand(['by-time', '--from', 'not-a-date'], db, io)).toBe(1);
    expect(errors.join('\n')).toContain('Invalid from date');

    errors.length = 0;
    expect(await executeAuditCommand(['by-time', '--limit', '-3'], db, io)).toBe(1);
    expect(errors.join('\n')).toContain('Invalid limit');

    expect(ops.filter((call) => call.op !== 'select')).toEqual([]);
  });

  it('marks a zero or missing fee as historical', async () => {
    const zero = createDb(() => ({ data: record({ fee_stroops: 0 }), error: null }));
    expect(await executeAuditCommand(['--json', 'by-raffle', '42'], zero.db, io)).toBe(0);
    expect(outputJson()).toMatchObject({
      record: { feeStroops: 0, feeStatus: 'historical_unrecorded' },
    });

    logs.length = 0;
    const missing = createDb(() => ({ data: record({ fee_stroops: null }), error: null }));
    expect(await executeAuditCommand(['--json', 'by-raffle', '42'], missing.db, io)).toBe(0);
    expect(outputJson()).toMatchObject({
      record: { feeStroops: null, feeStatus: 'historical_unrecorded' },
    });
  });

  it('never updates or deletes an audit record', async () => {
    const anchor = {
      id: 1,
      chain_head_hash: 'abc',
      record_count: 0,
      anchored_at: '2026-01-01T00:00:00.000Z',
      anchor_type: 'cli',
      external_ref: null,
    };
    const { db, ops } = createDb((table, op) => {
      if (table === 'audit_chain_anchors' && op === 'insert') return { data: anchor, error: null };
      if (table === 'audit_chain_anchors') return { data: [], error: null };
      return { data: [], error: null, count: 0 };
    });

    const commands = [
      ['by-raffle', '42'],
      ['by-time', '--from', '2026-01-01T00:00:00Z'],
      ['by-status', 'revealed'],
      ['summary'],
      ['verify-chain'],
      ['anchor', '--type', 'cli'],
      ['anchor-verify'],
      ['anchor-history'],
    ];
    for (const command of commands) {
      await executeAuditCommand(command, db, io);
    }

    const auditMutations = ops.filter(
      (call) => call.table === 'vrf_audit_log' && call.op !== 'select',
    );
    expect(auditMutations).toEqual([]);
    expect(ops.some((call) => call.table === 'audit_chain_anchors' && call.op === 'insert')).toBe(
      true,
    );
    expect(ops.some((call) => call.op === 'delete' || call.op === 'update')).toBe(false);
  });

  it('returns an error payload for an empty raffle lookup', async () => {
    const { db } = createDb(() => ({ data: null, error: { message: 'No rows' } }));
    expect(await executeAuditCommand(['--json', 'by-raffle', '42'], db, io)).toBe(1);
    expect(outputJson()).toMatchObject({
      ok: false,
      error: expect.stringContaining('No record found'),
    });
  });
});
