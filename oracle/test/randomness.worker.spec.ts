import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import { ContractService } from '../src/contract/contract.service';
import { VrfService } from '../src/randomness/vrf.service';
import { PrngService } from '../src/randomness/prng.service';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';
import { AuditLoggerService } from '../src/audit/audit-logger.service';
import { BatchCollector } from '../src/queue/batch-collector.service';
import { RANDOMNESS_QUEUE } from '../src/queue/randomness.queue';
import { RandomnessMethod } from '../src/queue/queue.types';
import { RevealItem, BatchSubmitResult } from '../src/queue/batch-reveal.types';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const revealItemArb = fc.record<RevealItem>({
  raffleId: fc.nat({ max: 100000 }),
  requestId: fc.string({ minLength: 1, maxLength: 36 }),
  seed: fc.hexaString({ minLength: 64, maxLength: 64 }),
  proof: fc.hexaString({ minLength: 128, maxLength: 128 }),
  method: fc.constantFrom(RandomnessMethod.VRF, RandomnessMethod.PRNG),
});

type BatchItemResult = { raffleId: number; success: boolean; errorCode?: string };

/** Generates a batch item result: success, ALREADY_FINALISED, or other failure */
const batchItemResultArb = fc.oneof(
  fc.record<BatchItemResult>({ raffleId: fc.nat({ max: 100000 }), success: fc.constant(true) }),
  fc.record<BatchItemResult>({
    raffleId: fc.nat({ max: 100000 }),
    success: fc.constant(false),
    errorCode: fc.constant('ALREADY_FINALISED'),
  }),
  fc.record<BatchItemResult>({
    raffleId: fc.nat({ max: 100000 }),
    success: fc.constant(false),
    errorCode: fc.constantFrom('INVALID_PROOF', 'TIMEOUT', 'UNKNOWN'),
  }),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a BatchSubmitResult from an array of per-item results.
 * Items in the result share a common txHash/ledger.
 */
function makeBatchResult(items: BatchItemResult[]): BatchSubmitResult {
  return { txHash: 'tx-abc123', ledger: 42, items };
}

/**
 * Creates a flush handler extracted from the worker so we can invoke it
 * directly in property tests without going through the Bull queue machinery.
 */
function captureFlushHandler(batchCollectorMock: jest.Mocked<BatchCollector>): {
  triggerFlush: (items: RevealItem[], batchResult: BatchSubmitResult) => Promise<void>;
} {
  let registeredHandler: ((result: { items: RevealItem[] }) => Promise<void>) | null = null;
  batchCollectorMock.onFlush.mockImplementation((handler) => {
    registeredHandler = handler as any;
  });
  return {
    triggerFlush: async (items: RevealItem[], batchResult: BatchSubmitResult) => {
      if (!registeredHandler) throw new Error('No flush handler registered');
      // Inject the batchResult into txSubmitter before calling the handler
      return registeredHandler({ items });
    },
  };
}

// ── Test setup factory ────────────────────────────────────────────────────────

interface WorkerTestContext {
  worker: RandomnessWorker;
  contractService: jest.Mocked<ContractService>;
  vrfService: jest.Mocked<VrfService>;
  prngService: jest.Mocked<PrngService>;
  txSubmitter: jest.Mocked<TxSubmitterService>;
  healthService: jest.Mocked<HealthService>;
  lagMonitor: jest.Mocked<LagMonitorService>;
  auditLogger: jest.Mocked<AuditLoggerService>;
  batchCollector: jest.Mocked<BatchCollector>;
  queue: jest.Mocked<any>;
  /** The flush handler registered by the worker via batchCollector.onFlush */
  flushHandler: (result: { items: RevealItem[] }) => Promise<void>;
}

async function buildWorkerContext(): Promise<WorkerTestContext> {
  let capturedFlushHandler: ((result: { items: RevealItem[] }) => Promise<void>) | null = null;

  const batchCollectorMock: jest.Mocked<BatchCollector> = {
    add: jest.fn(),
    onFlush: jest.fn().mockImplementation((handler) => {
      capturedFlushHandler = handler;
    }),
    onModuleDestroy: jest.fn(),
  } as any;

  const queueMock = { add: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RandomnessWorker,
      {
        provide: ContractService,
        useValue: {
          getRaffleData: jest.fn(),
          isRandomnessSubmitted: jest.fn(),
        },
      },
      { provide: VrfService, useValue: { compute: jest.fn() } },
      { provide: PrngService, useValue: { compute: jest.fn() } },
      {
        provide: TxSubmitterService,
        useValue: { submitRandomness: jest.fn(), submitBatch: jest.fn() },
      },
      {
        provide: HealthService,
        useValue: {
          recordSuccess: jest.fn(),
          recordFailure: jest.fn(),
          updateQueueDepth: jest.fn(),
          recordBatchSubmission: jest.fn(),
        },
      },
      {
        provide: LagMonitorService,
        useValue: {
          trackRequest: jest.fn(),
          fulfillRequest: jest.fn(),
          updateCurrentLedger: jest.fn(),
        },
      },
      {
        provide: AuditLoggerService,
        useValue: { log: jest.fn().mockResolvedValue(undefined) },
      },
      { provide: BatchCollector, useValue: batchCollectorMock },
      { provide: getQueueToken(RANDOMNESS_QUEUE), useValue: queueMock },
    ],
  }).compile();

  const worker = module.get<RandomnessWorker>(RandomnessWorker);

  return {
    worker,
    contractService: module.get(ContractService) as jest.Mocked<ContractService>,
    vrfService: module.get(VrfService) as jest.Mocked<VrfService>,
    prngService: module.get(PrngService) as jest.Mocked<PrngService>,
    txSubmitter: module.get(TxSubmitterService) as jest.Mocked<TxSubmitterService>,
    healthService: module.get(HealthService) as jest.Mocked<HealthService>,
    lagMonitor: module.get(LagMonitorService) as jest.Mocked<LagMonitorService>,
    auditLogger: module.get(AuditLoggerService) as jest.Mocked<AuditLoggerService>,
    batchCollector: batchCollectorMock,
    queue: queueMock,
    get flushHandler() {
      if (!capturedFlushHandler) throw new Error('Flush handler not registered');
      return capturedFlushHandler;
    },
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('RandomnessWorker — unit tests', () => {
  let ctx: WorkerTestContext;

  beforeEach(async () => {
    ctx = await buildWorkerContext();
  });

  it('registers a flush handler on construction', () => {
    expect(ctx.batchCollector.onFlush).toHaveBeenCalledTimes(1);
    expect(typeof ctx.flushHandler).toBe('function');
  });

  it('skips already-submitted raffles and does not call batchCollector.add', async () => {
    ctx.contractService.isRandomnessSubmitted.mockResolvedValue(true);
    const job = { id: '1', data: { raffleId: 10, requestId: 'req-1', prizeAmount: 100 } } as any;
    await ctx.worker.handleRandomnessJob(job);
    expect(ctx.batchCollector.add).not.toHaveBeenCalled();
  });

  it('calls batchCollector.add with correct RevealItem for PRNG path', async () => {
    ctx.contractService.isRandomnessSubmitted.mockResolvedValue(false);
    ctx.prngService.compute.mockResolvedValue({ seed: 'aabbcc', proof: 'ddeeff' });
    const job = { id: '2', data: { raffleId: 20, requestId: 'req-2', prizeAmount: 100 } } as any;
    await ctx.worker.handleRandomnessJob(job);
    expect(ctx.batchCollector.add).toHaveBeenCalledWith({
      raffleId: 20,
      requestId: 'req-2',
      seed: 'aabbcc',
      proof: 'ddeeff',
      method: RandomnessMethod.PRNG,
    });
  });

  it('calls batchCollector.add with VRF method for high-stakes raffle', async () => {
    ctx.contractService.isRandomnessSubmitted.mockResolvedValue(false);
    ctx.vrfService.compute.mockResolvedValue({ seed: 'vrf-seed', proof: 'vrf-proof' });
    const job = { id: '3', data: { raffleId: 30, requestId: 'req-3', prizeAmount: 1000 } } as any;
    await ctx.worker.handleRandomnessJob(job);
    expect(ctx.batchCollector.add).toHaveBeenCalledWith(
      expect.objectContaining({ method: RandomnessMethod.VRF }),
    );
  });

  it('flush handler calls auditLogger for successful items', async () => {
    const item: RevealItem = {
      raffleId: 1, requestId: 'r1', seed: 'aa'.repeat(32), proof: 'bb'.repeat(64),
      method: RandomnessMethod.PRNG,
    };
    ctx.txSubmitter.submitBatch.mockResolvedValue(makeBatchResult([
      { raffleId: 1, success: true },
    ]));
    await ctx.flushHandler({ items: [item] });
    expect(ctx.auditLogger.log).toHaveBeenCalledTimes(1);
    expect(ctx.auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ raffle_id: 1, tx_hash: 'tx-abc123' }),
    );
  });

  it('flush handler re-enqueues non-finalised failures', async () => {
    const item: RevealItem = {
      raffleId: 5, requestId: 'r5', seed: 'cc'.repeat(32), proof: 'dd'.repeat(64),
      method: RandomnessMethod.VRF,
    };
    ctx.txSubmitter.submitBatch.mockResolvedValue(makeBatchResult([
      { raffleId: 5, success: false, errorCode: 'INVALID_PROOF' },
    ]));
    await ctx.flushHandler({ items: [item] });
    expect(ctx.queue.add).toHaveBeenCalledWith(expect.objectContaining({ raffleId: 5 }));
    expect(ctx.auditLogger.log).not.toHaveBeenCalled();
  });

  it('flush handler discards ALREADY_FINALISED items without re-enqueuing', async () => {
    const item: RevealItem = {
      raffleId: 7, requestId: 'r7', seed: 'ee'.repeat(32), proof: 'ff'.repeat(64),
      method: RandomnessMethod.PRNG,
    };
    ctx.txSubmitter.submitBatch.mockResolvedValue(makeBatchResult([
      { raffleId: 7, success: false, errorCode: 'ALREADY_FINALISED' },
    ]));
    await ctx.flushHandler({ items: [item] });
    expect(ctx.queue.add).not.toHaveBeenCalled();
    expect(ctx.auditLogger.log).not.toHaveBeenCalled();
  });
});

// ── Property tests ────────────────────────────────────────────────────────────

describe('RandomnessWorker — property tests', () => {
  // We build a fresh context per property to avoid state leakage.
  // Each property creates its own context inside the fc.assert callback.

  // ── Property 12: Already-submitted items filtered before batching ──────────
  // Feature: batch-randomness-reveal, Property 12: Already-submitted items are filtered before batching
  // Validates: Requirements 5.1, 5.2
  describe('Property 12: Already-submitted items filtered before batching', () => {
    it('never adds a RevealItem to BatchCollector when isRandomnessSubmitted returns true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.nat({ max: 100000 }), { minLength: 1, maxLength: 20 }),
          fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
          async (raffleIds, submittedFlags) => {
            const ctx = await buildWorkerContext();

            // Pair each raffleId with a submitted flag (cycle flags if shorter)
            const pairs = raffleIds.map((id, i) => ({
              raffleId: id,
              submitted: submittedFlags[i % submittedFlags.length],
            }));

            ctx.contractService.isRandomnessSubmitted.mockImplementation(
              async (id: number) => pairs.find((p) => p.raffleId === id)?.submitted ?? false,
            );
            ctx.prngService.compute.mockResolvedValue({ seed: 'aa'.repeat(32), proof: 'bb'.repeat(64) });
            ctx.vrfService.compute.mockResolvedValue({ seed: 'cc'.repeat(32), proof: 'dd'.repeat(64) });

            for (const { raffleId } of pairs) {
              const job = {
                id: String(raffleId),
                data: { raffleId, requestId: `req-${raffleId}`, prizeAmount: 100 },
              } as any;
              await ctx.worker.handleRandomnessJob(job);
            }

            const expectedAddCount = pairs.filter((p) => !p.submitted).length;
            expect(ctx.batchCollector.add).toHaveBeenCalledTimes(expectedAddCount);

            // Verify none of the submitted raffleIds were added
            const addedRaffleIds = (ctx.batchCollector.add as jest.Mock).mock.calls.map(
              (call) => (call[0] as RevealItem).raffleId,
            );
            const submittedIds = pairs.filter((p) => p.submitted).map((p) => p.raffleId);
            for (const id of submittedIds) {
              expect(addedRaffleIds).not.toContain(id);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 11: Only failed non-finalised items are re-enqueued ──────────
  // Feature: batch-randomness-reveal, Property 11: Only failed non-finalised items are re-enqueued
  // Validates: Requirements 4.2, 4.3
  describe('Property 11: Only failed non-finalised items are re-enqueued', () => {
    it('enqueues exactly F-A jobs where F=failures and A=ALREADY_FINALISED count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(batchItemResultArb, { minLength: 1, maxLength: 20 }),
          async (resultItems) => {
            const ctx = await buildWorkerContext();

            // Build matching RevealItems for each result item
            const revealItems: RevealItem[] = resultItems.map((r) => ({
              raffleId: r.raffleId,
              requestId: `req-${r.raffleId}`,
              seed: 'aa'.repeat(32),
              proof: 'bb'.repeat(64),
              method: RandomnessMethod.PRNG,
            }));

            ctx.txSubmitter.submitBatch.mockResolvedValue(makeBatchResult(resultItems));

            await ctx.flushHandler({ items: revealItems });

            const successes = resultItems.filter((r) => r.success).length;
            const alreadyFinalised = resultItems.filter(
              (r) => !r.success && r.errorCode === 'ALREADY_FINALISED',
            ).length;
            const failures = resultItems.filter((r) => !r.success).length;
            const expectedRequeued = failures - alreadyFinalised;

            expect(ctx.queue.add).toHaveBeenCalledTimes(expectedRequeued);
            // Successful items must never be re-enqueued
            const successRaffleIds = resultItems.filter((r) => r.success).map((r) => r.raffleId);
            const requeuedRaffleIds = (ctx.queue.add as jest.Mock).mock.calls.map(
              (call) => call[0]?.raffleId,
            );
            for (const id of successRaffleIds) {
              expect(requeuedRaffleIds).not.toContain(id);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 13: Audit log call count matches successful items exactly ─────
  // Feature: batch-randomness-reveal, Property 13: Audit log entries match successful items exactly
  // Validates: Requirements 6.1, 6.3
  describe('Property 13: Audit log call count matches successful items exactly', () => {
    it('calls auditLogger.log exactly S times for S successful items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(batchItemResultArb, { minLength: 1, maxLength: 20 }),
          async (resultItems) => {
            const ctx = await buildWorkerContext();

            const revealItems: RevealItem[] = resultItems.map((r) => ({
              raffleId: r.raffleId,
              requestId: `req-${r.raffleId}`,
              seed: 'aa'.repeat(32),
              proof: 'bb'.repeat(64),
              method: RandomnessMethod.PRNG,
            }));

            ctx.txSubmitter.submitBatch.mockResolvedValue(makeBatchResult(resultItems));

            await ctx.flushHandler({ items: revealItems });

            const successCount = resultItems.filter((r) => r.success).length;
            expect(ctx.auditLogger.log).toHaveBeenCalledTimes(successCount);

            // Failed items must never be logged
            const failedRaffleIds = resultItems.filter((r) => !r.success).map((r) => r.raffleId);
            const loggedRaffleIds = (ctx.auditLogger.log as jest.Mock).mock.calls.map(
              (call) => call[0]?.raffle_id,
            );
            for (const id of failedRaffleIds) {
              expect(loggedRaffleIds).not.toContain(id);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 14: Each audit log entry contains all required fields ─────────
  // Feature: batch-randomness-reveal, Property 14: Each audit log entry contains all required fields
  // Validates: Requirements 6.2
  describe('Property 14: Each audit log entry contains all required fields', () => {
    it('every audit log call includes tx_hash, ledger-derived fields, raffle_id, request_id, seed, proof, method', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(revealItemArb, { minLength: 1, maxLength: 10 }),
          async (revealItems) => {
            const ctx = await buildWorkerContext();

            // All items succeed
            const resultItems: BatchItemResult[] = revealItems.map((item) => ({
              raffleId: item.raffleId,
              success: true,
            }));

            const batchResult = makeBatchResult(resultItems);
            ctx.txSubmitter.submitBatch.mockResolvedValue(batchResult);

            await ctx.flushHandler({ items: revealItems });

            expect(ctx.auditLogger.log).toHaveBeenCalledTimes(revealItems.length);

            const calls = (ctx.auditLogger.log as jest.Mock).mock.calls;
            for (const [entry] of calls) {
              // Required fields from the batch transaction
              expect(entry).toHaveProperty('tx_hash', batchResult.txHash);
              // Required item-specific fields
              expect(entry).toHaveProperty('raffle_id');
              expect(entry).toHaveProperty('request_id');
              expect(entry).toHaveProperty('seed');
              expect(entry).toHaveProperty('proof');
              expect(entry).toHaveProperty('method');

              // Verify the entry matches the corresponding RevealItem
              const matchingItem = revealItems.find((i) => i.raffleId === entry.raffle_id);
              expect(matchingItem).toBeDefined();
              expect(entry.request_id).toBe(matchingItem!.requestId);
              expect(entry.seed).toBe(matchingItem!.seed);
              expect(entry.proof).toBe(matchingItem!.proof);
              expect(entry.method).toBe(matchingItem!.method);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
