import { Test, TestingModule } from '@nestjs/testing';
import { RandomnessAuditService } from './randomness-audit.service';
import { SUPABASE_CLIENT } from './supabase.provider';
import { RandomnessAuditRecord } from './randomness-audit.types';

type Row = Record<string, unknown>;

function createMockSupabase() {
  const rows = new Map<string, Row>();
  let nextId = 1;

  const client = {
    from: jest.fn((table: string) => {
      if (table !== 'randomness_audit_log') {
        throw new Error(`Unexpected table: ${table}`);
      }

      let pendingInsert: Row | null = null;
      let pendingUpdate: Row | null = null;
      let filterRequestId: string | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        insert: jest.fn((row: Row) => {
          pendingInsert = { ...row };
          return chain;
        }),
        update: jest.fn((patch: Row) => {
          pendingUpdate = patch;
          return chain;
        }),
        select: jest.fn(() => chain),
        eq: jest.fn((_col: string, requestId: string) => {
          filterRequestId = requestId;
          return chain;
        }),
        single: jest.fn(async () => {
          if (pendingInsert) {
            const record: Row = {
              id: nextId++,
              ...pendingInsert,
            };
            rows.set(String(record.request_id), record);
            pendingInsert = null;
            return { data: record, error: null };
          }

          if (pendingUpdate && filterRequestId) {
            const existing = rows.get(filterRequestId);
            if (!existing) {
              return { data: null, error: { code: 'PGRST116', message: 'not found' } };
            }
            Object.assign(existing, pendingUpdate);
            pendingUpdate = null;
            return { data: existing, error: null };
          }

          if (!filterRequestId) {
            return { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }

          const record = rows.get(filterRequestId);
          if (!record) {
            return { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }
          return { data: record, error: null };
        }),
      };

      return chain;
    }),
  };

  return { client, rows };
}

describe('RandomnessAuditService', () => {
  let service: RandomnessAuditService;
  let mock: ReturnType<typeof createMockSupabase>;

  const contractEventId =
    'ledger:12345:tx:abc123event:0:raffle:42';
  const queueJobId = 'bull-job-99';
  const requestInput = {
    raffleId: 42,
    requestId: 'req-abc',
    stableRequestId: contractEventId,
    prizeAmount: 600,
    priority: 1,
    secret: 'must-not-persist',
    nonce: 'also-redacted',
  };

  beforeEach(async () => {
    mock = createMockSupabase();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RandomnessAuditService,
        { provide: SUPABASE_CLIENT, useValue: mock.client },
      ],
    }).compile();

    service = module.get(RandomnessAuditService);
  });

  it('ensurePending is idempotent for the same request_id', async () => {
    const params = {
      requestInput: { raffleId: 1, requestId: 'idem-req' },
      contractEventId: 'event-1',
      queueJobId: 'job-1',
    };

    const first = await service.ensurePending(params);
    const second = await service.ensurePending(params);

    expect(second.id).toBe(first.id);
    expect(mock.rows.size).toBe(1);
  });

  it('creates a succeeded audit record with redacted input and verification metadata', async () => {
    await service.createPending({
      requestInput: requestInput as typeof requestInput & { secret: string },
      contractEventId,
      queueJobId,
    });

    const record = await service.markSucceeded({
      requestId: 'req-abc',
      provider: 'vrf',
      seed: 'a'.repeat(64),
      proof: 'b'.repeat(128),
      submissionTxHash: 'submit-tx-hash',
      submissionLedger: 12346,
    });

    expect(record.status).toBe('succeeded');
    expect(record.submission_tx_hash).toBe('submit-tx-hash');
    expect(record.contract_event_id).toBe(contractEventId);
    expect(record.queue_job_id).toBe(queueJobId);
    expect(record.provider).toBe('vrf');
    expect(record.proof_metadata).toMatchObject({
      seed: 'a'.repeat(64),
      proof: 'b'.repeat(128),
      seedLength: 64,
      proofLength: 128,
    });
    expect(record.request_input).toMatchObject({
      raffleId: 42,
      requestId: 'req-abc',
      secret: '[REDACTED]',
      nonce: '[REDACTED]',
    });
    expect(record.request_input).not.toHaveProperty('privateKey');
  });

  it('creates a failed audit record with error message', async () => {
    await service.createPending({
      requestInput: {
        raffleId: 7,
        requestId: 'req-fail',
        stableRequestId: 'ledger:1:tx:x:event:0:raffle:7',
      },
      contractEventId: 'ledger:1:tx:x:event:0:raffle:7',
      queueJobId: 'job-1',
    });

    const record = await service.markFailed({
      requestId: 'req-fail',
      errorMessage: 'Transaction submission returned success=false',
      provider: 'prng',
    });

    expect(record.status).toBe('failed');
    expect(record.error_message).toContain('submission');
    expect(record.submission_tx_hash ?? null).toBeNull();
    expect(record.completed_at).toBeTruthy();
  });

  it('traces one draw from contract event through queue job to submission', async () => {
    await service.createPending({
      requestInput: {
        raffleId: 99,
        requestId: 'trace-req',
        stableRequestId: contractEventId,
      },
      contractEventId,
      queueJobId,
    });

    await service.markSucceeded({
      requestId: 'trace-req',
      provider: 'vrf',
      seed: 'c'.repeat(64),
      proof: 'd'.repeat(128),
      submissionTxHash: 'final-tx',
      submissionLedger: 200,
    });

    const trace = await service.getTraceByRequestId('trace-req');
    expect(trace).not.toBeNull();
    expect(trace!.timeline.map((s) => s.phase)).toEqual([
      'contract_event',
      'queue_job',
      'decision',
      'submission',
    ]);
    expect(trace!.contractEventId).toBe(contractEventId);
    expect(trace!.queueJobId).toBe(queueJobId);
    expect(trace!.submissionTxHash).toBe('final-tx');
    expect(trace!.timeline[0].detail.contractEventId).toBe(contractEventId);
    expect(trace!.timeline[3].detail.submissionTxHash).toBe('final-tx');
  });

  it('buildTrace works on an in-memory record', () => {
    const record: RandomnessAuditRecord = {
      id: 1,
      request_id: 'r1',
      stable_request_id: contractEventId,
      contract_event_id: contractEventId,
      queue_job_id: queueJobId,
      raffle_id: 1,
      request_input: { raffleId: 1, requestId: 'r1' },
      provider: 'prng',
      proof_metadata: {
        seed: 'ee',
        proof: 'ff',
        seedLength: 2,
        proofLength: 2,
        seedDigest: 'aa',
        proofDigest: 'bb',
      },
      submission_tx_hash: 'tx',
      submission_ledger: 1,
      status: 'succeeded',
      error_message: null,
      created_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-01-01T00:00:01.000Z',
    };

    const trace = service.buildTrace(record);
    expect(trace.timeline).toHaveLength(4);
  });
});
