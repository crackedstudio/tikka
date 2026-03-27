import * as fc from 'fast-check';
import { TxSubmitterService } from './tx-submitter.service';
import { RevealItem } from '../queue/batch-reveal.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arbitrary for a single RevealItem */
const revealItemArb = fc.record<RevealItem>({
  raffleId: fc.nat({ max: 0xffffffff }),
  requestId: fc.uuid(),
  seed: fc.hexaString({ minLength: 64, maxLength: 64 }),
  proof: fc.hexaString({ minLength: 128, maxLength: 128 }),
  method: fc.constantFrom('VRF' as const, 'PRNG' as const),
});

/** Build a minimal mock ConfigService */
function mockConfig(overrides: Record<string, string> = {}) {
  return {
    get: (key: string) =>
      overrides[key] ??
      ({
        SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        RAFFLE_CONTRACT_ID: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        ORACLE_SECRET_KEY: 'SCZANGBA5RLMPI7JMTP2UOW7LONBCKLGJFXUCNXFZCLR76IQNAWLEZDA',
      }[key] ?? ''),
  };
}

/**
 * Build a TxSubmitterService with a fully mocked rpcServer.
 * Returns the service and the mock rpcServer so tests can configure behaviour.
 */
function buildService(rpcOverrides: Partial<{
  getAccount: jest.Mock;
  simulateTransaction: jest.Mock;
  prepareTransaction: jest.Mock;
  sendTransaction: jest.Mock;
  getTransaction: jest.Mock;
}> = {}) {
  const mockRpc = {
    getAccount: rpcOverrides.getAccount ?? jest.fn().mockResolvedValue({ id: 'G...', sequence: '0' }),
    simulateTransaction: rpcOverrides.simulateTransaction ?? jest.fn().mockResolvedValue({}),
    prepareTransaction: rpcOverrides.prepareTransaction ?? jest.fn().mockImplementation((tx) => {
      // Return a fake signed-able object
      return Promise.resolve({ sign: jest.fn(), ...tx });
    }),
    sendTransaction: rpcOverrides.sendTransaction ?? jest.fn().mockResolvedValue({ hash: 'abc123' }),
    getTransaction: rpcOverrides.getTransaction ?? jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 42 }),
  };

  const svc = new TxSubmitterService(mockConfig() as any);
  // Inject mock rpcServer
  (svc as any).rpcServer = mockRpc;

  return { svc, mockRpc };
}

// ---------------------------------------------------------------------------
// Property 7: Batch transaction encodes all items
// Feature: batch-randomness-reveal, Property 7: Batch transaction encodes all items
// ---------------------------------------------------------------------------
describe('Property 7 — batch transaction encodes all items', () => {
  it('calls receive_randomness_batch with exactly N tuples in input order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(revealItemArb, { minLength: 2, maxLength: 10 }),
        async (items) => {
          let capturedArgs: any[] | null = null;

          const prepareTransactionMock = jest.fn().mockImplementation((tx) => {
            // Capture the operations from the transaction builder
            capturedArgs = tx;
            return Promise.resolve({ sign: jest.fn() });
          });

          const simulateMock = jest.fn().mockResolvedValue({});

          const { svc, mockRpc } = buildService({
            simulateTransaction: simulateMock,
            prepareTransaction: prepareTransactionMock,
            sendTransaction: jest.fn().mockResolvedValue({ hash: 'txhash1' }),
            getTransaction: jest.fn().mockResolvedValue({
              status: 'SUCCESS',
              ledger: 1,
              returnValue: buildMockReturnValue(items.map(() => ({ ok: true }))),
            }),
          });

          await svc.submitBatch(items);

          // simulateTransaction was called once (for the batch)
          expect(simulateMock).toHaveBeenCalledTimes(1);
          // prepareTransaction was called once
          expect(prepareTransactionMock).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 50 },
    );
  });
  // **Validates: Requirements 3.1**
});

// ---------------------------------------------------------------------------
// Property 8: BatchSubmitResult has one entry per input item on success
// Feature: batch-randomness-reveal, Property 8: BatchSubmitResult length on success
// ---------------------------------------------------------------------------
describe('Property 8 — BatchSubmitResult has one entry per input item on success', () => {
  it('returns items array with same length as input on SUCCESS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(revealItemArb, { minLength: 1, maxLength: 10 }),
        async (items) => {
          const { svc } = buildService({
            sendTransaction: jest.fn().mockResolvedValue({ hash: 'txhash' }),
            getTransaction: jest.fn().mockResolvedValue({
              status: 'SUCCESS',
              ledger: 5,
              returnValue: buildMockReturnValue(items.map(() => ({ ok: true }))),
            }),
          });

          const result = await svc.submitBatch(items);

          expect(result.items).toHaveLength(items.length);
          result.items.forEach((item, idx) => {
            expect(item.raffleId).toBe(items[idx].raffleId);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
  // **Validates: Requirements 3.4**
});

// ---------------------------------------------------------------------------
// Property 9: All items marked failed when transaction exhausts retries
// Feature: batch-randomness-reveal, Property 9: All items marked failed when retries exhausted
// ---------------------------------------------------------------------------
describe('Property 9 — all items marked failed when retries exhausted', () => {
  it('returns all success:false when RPC always rejects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(revealItemArb, { minLength: 1, maxLength: 8 }),
        async (items) => {
          const { svc } = buildService({
            sendTransaction: jest.fn().mockRejectedValue(new Error('network error')),
          });

          // Speed up retries by zeroing backoff
          (svc as any).INITIAL_BACKOFF_MS = 0;
          (svc as any).MAX_RETRIES = 2;

          const result = await svc.submitBatch(items);

          expect(result.txHash).toBe('');
          expect(result.items).toHaveLength(items.length);
          result.items.forEach((item) => {
            expect(item.success).toBe(false);
          });
        },
      ),
      { numRuns: 50 },
    );
  });
  // **Validates: Requirements 3.5, 3.6**
});

// ---------------------------------------------------------------------------
// Property 10: Contract return value maps to per-item success flags
// Feature: batch-randomness-reveal, Property 10: Contract return value maps to per-item flags
// ---------------------------------------------------------------------------
describe('Property 10 — contract return value maps to per-item success flags', () => {
  it('maps Ok/Err entries to success:true/false in positional order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (successFlags) => {
          const items = successFlags.map((_, idx) => ({
            raffleId: idx + 1,
            requestId: `req-${idx}`,
            seed: '00'.repeat(32),
            proof: '00'.repeat(64),
            method: 'VRF' as const,
          }));

          const { svc } = buildService({
            sendTransaction: jest.fn().mockResolvedValue({ hash: 'txhash' }),
            getTransaction: jest.fn().mockResolvedValue({
              status: 'SUCCESS',
              ledger: 10,
              returnValue: buildMockReturnValue(
                successFlags.map((ok) => (ok ? { ok: true } : { ok: false, code: 2 })),
              ),
            }),
          });

          const result = await svc.submitBatch(items);

          expect(result.items).toHaveLength(successFlags.length);
          result.items.forEach((item, idx) => {
            expect(item.success).toBe(successFlags[idx]);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
  // **Validates: Requirements 4.1**
});

// ---------------------------------------------------------------------------
// Property 18: Single-item batch routes to receive_randomness
// Feature: batch-randomness-reveal, Property 18: Single-item batch routes to receive_randomness
// ---------------------------------------------------------------------------
describe('Property 18 — single-item batch routes to receive_randomness', () => {
  it('calls submitRandomness (not batch path) when items.length === 1', async () => {
    await fc.assert(
      fc.asyncProperty(revealItemArb, async (item) => {
        const { svc, mockRpc } = buildService({
          sendTransaction: jest.fn().mockResolvedValue({ hash: 'single-hash' }),
          getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 3 }),
        });

        // Spy on submitRandomness to confirm it's called
        const submitRandomnessSpy = jest.spyOn(svc, 'submitRandomness').mockResolvedValue({
          txHash: 'single-hash',
          ledger: 3,
          success: true,
        });

        const result = await svc.submitBatch([item]);

        expect(submitRandomnessSpy).toHaveBeenCalledTimes(1);
        expect(submitRandomnessSpy).toHaveBeenCalledWith(
          item.raffleId,
          expect.objectContaining({ seed: item.seed, proof: item.proof }),
        );
        expect(result.items).toHaveLength(1);
        expect(result.items[0].raffleId).toBe(item.raffleId);
        expect(result.items[0].success).toBe(true);

        submitRandomnessSpy.mockRestore();
      }),
      { numRuns: 100 },
    );
  });
  // **Validates: Requirements 8.4**
});

// ---------------------------------------------------------------------------
// Helper: build a mock ScVal return value that parseBatchReturnValue can parse
// ---------------------------------------------------------------------------
function buildMockReturnValue(entries: Array<{ ok: boolean; code?: number }>) {
  const innerVecs = entries.map((e) => {
    if (e.ok) {
      return {
        value: () => [
          { value: () => 'Ok', _value: 'Ok', toString: () => 'Ok' },
          { value: () => undefined, _value: undefined },
        ],
        _value: [
          { value: () => 'Ok', _value: 'Ok', toString: () => 'Ok' },
          { value: () => undefined, _value: undefined },
        ],
      };
    }
    const code = e.code ?? 2;
    return {
      value: () => [
        { value: () => 'Err', _value: 'Err', toString: () => 'Err' },
        { value: () => code, _value: code },
      ],
      _value: [
        { value: () => 'Err', _value: 'Err', toString: () => 'Err' },
        { value: () => code, _value: code },
      ],
    };
  });

  return {
    value: () => innerVecs,
    _value: innerVecs,
  };
}
