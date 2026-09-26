import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RescueExecutorService } from './rescue-executor.service';
import { RANDOMNESS_QUEUE } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { OracleLoggerService } from '../logger/oracle-logger';
import { RandomnessMethod } from '../queue/queue.types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const PRNG_RESULT = { seed: 'prng-seed', proof: 'prng-proof' };
const VRF_RESULT = { seed: 'vrf-seed', proof: 'vrf-proof' };

function makeQueueJob(
  jobId: string,
  raffleId: number,
  requestId: string,
  overrides: Partial<{ failedReason: string; timestamp: number; attemptsMade: number }> = {},
) {
  return {
    id: jobId,
    data: { raffleId, requestId },
    attemptsMade: overrides.attemptsMade ?? 1,
    failedReason: overrides.failedReason,
    timestamp: overrides.timestamp ?? Date.now(),
    getState: jest.fn().mockResolvedValue('failed'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('RescueExecutorService', () => {
  let service: RescueExecutorService;
  let mockQueue: jest.Mocked<any>;
  let mockContractService: jest.Mocked<any>;
  let mockVrfService: jest.Mocked<any>;
  let mockPrngService: jest.Mocked<any>;
  let mockTxSubmitter: jest.Mocked<any>;

  beforeEach(async () => {
    mockQueue = {
      getJob: jest.fn(),
      add: jest.fn(),
      getFailed: jest.fn().mockResolvedValue([]),
    };

    mockContractService = {
      isRandomnessSubmitted: jest.fn(),
      getRaffleData: jest.fn(),
    };

    mockVrfService = { compute: jest.fn().mockResolvedValue(VRF_RESULT) };
    mockPrngService = { compute: jest.fn().mockResolvedValue(PRNG_RESULT) };
    mockTxSubmitter = {
      submitRandomness: jest.fn().mockResolvedValue({ success: true, txHash: 'tx-hash', ledger: 9999 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescueExecutorService,
        {
          provide: OracleLoggerService,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
        { provide: getQueueToken(RANDOMNESS_QUEUE), useValue: mockQueue },
        { provide: ContractService, useValue: mockContractService },
        { provide: VrfService, useValue: mockVrfService },
        { provide: PrngService, useValue: mockPrngService },
        { provide: TxSubmitterService, useValue: mockTxSubmitter },
      ],
    }).compile();

    service = module.get<RescueExecutorService>(RescueExecutorService);
  });

  // ─── reEnqueueJob ─────────────────────────────────────────────────────────────

  describe('reEnqueueJob', () => {
    it('re-enqueues a failed job and returns the new job ID', async () => {
      const payload = { raffleId: 1, requestId: 'req-1' };
      mockQueue.getJob.mockResolvedValue({ id: 'old-1', data: payload });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockQueue.add.mockResolvedValue({ id: 'new-1' });

      const result = await service.reEnqueueJob('old-1', 'alice', 'RPC timeout');

      expect(result.success).toBe(true);
      expect(result.newJobId).toBe('new-1');
      expect(mockQueue.add).toHaveBeenCalledWith(payload, expect.objectContaining({ attempts: 3 }));
    });

    it('returns failure when job is not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.reEnqueueJob('missing', 'alice', 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('returns failure and does NOT enqueue when raffle is already finalized (idempotency)', async () => {
      const payload = { raffleId: 2, requestId: 'req-2' };
      mockQueue.getJob.mockResolvedValue({ id: 'j2', data: payload });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.reEnqueueJob('j2', 'alice', 'retry');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('is idempotent: calling re-enqueue twice for a finalized raffle never submits to queue', async () => {
      const payload = { raffleId: 3, requestId: 'req-3' };
      mockQueue.getJob.mockResolvedValue({ id: 'j3', data: payload });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      await service.reEnqueueJob('j3', 'alice', 'first call');
      await service.reEnqueueJob('j3', 'alice', 'second call');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('logs a RE_ENQUEUE SUCCESS entry on success', async () => {
      const payload = { raffleId: 4, requestId: 'req-4' };
      mockQueue.getJob.mockResolvedValue({ id: 'j4', data: payload });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockQueue.add.mockResolvedValue({ id: 'new-4' });

      await service.reEnqueueJob('j4', 'bob', 'reason');

      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'RE_ENQUEUE' && l.raffleId === 4);
      expect(entry).toBeDefined();
      expect(entry!.result).toBe('SUCCESS');
      expect(entry!.operator).toBe('bob');
    });

    it('logs a RE_ENQUEUE FAILURE entry when queue.add throws', async () => {
      const payload = { raffleId: 5, requestId: 'req-5' };
      mockQueue.getJob.mockResolvedValue({ id: 'j5', data: payload });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockQueue.add.mockRejectedValue(new Error('Queue full'));

      const result = await service.reEnqueueJob('j5', 'alice', 'retry');

      expect(result.success).toBe(false);
      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'RE_ENQUEUE' && l.result === 'FAILURE');
      expect(entry).toBeDefined();
    });
  });

  // ─── forceSubmit ──────────────────────────────────────────────────────────────

  describe('forceSubmit', () => {
    it('submits randomness with PRNG for a low-stakes raffle (<500 XLM)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const result = await service.forceSubmit(10, 'req-10', 'charlie', 'manual', 100);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('tx-hash');
      expect(mockPrngService.compute).toHaveBeenCalledWith('req-10');
      expect(mockVrfService.compute).not.toHaveBeenCalled();
    });

    it('submits randomness with VRF for a high-stakes raffle (≥500 XLM)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const result = await service.forceSubmit(11, 'req-11', 'charlie', 'manual', 1000);

      expect(result.success).toBe(true);
      expect(mockVrfService.compute).toHaveBeenCalledWith('req-11');
      expect(mockPrngService.compute).not.toHaveBeenCalled();
    });

    it('fetches prizeAmount from contract when not provided', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId: 12, prizeAmount: 750, status: 'DRAWING' });

      const result = await service.forceSubmit(12, 'req-12', 'charlie', 'manual');

      expect(mockContractService.getRaffleData).toHaveBeenCalledWith(12);
      expect(result.success).toBe(true);
      expect(mockVrfService.compute).toHaveBeenCalled(); // 750 >= 500
    });

    it('returns failure when raffle is already finalized (idempotency guard)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.forceSubmit(13, 'req-13', 'charlie', 'manual', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
      expect(mockPrngService.compute).not.toHaveBeenCalled();
      expect(mockVrfService.compute).not.toHaveBeenCalled();
      expect(mockTxSubmitter.submitRandomness).not.toHaveBeenCalled();
    });

    it('is idempotent: calling forceSubmit twice on a finalized raffle never submits a tx', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const r1 = await service.forceSubmit(14, 'req-14', 'charlie', 'first', 100);
      const r2 = await service.forceSubmit(14, 'req-14', 'charlie', 'second', 100);

      expect(r1.success).toBe(false);
      expect(r2.success).toBe(false);
      expect(mockTxSubmitter.submitRandomness).not.toHaveBeenCalled();
    });

    it('returns failure when txSubmitter reports success:false', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockTxSubmitter.submitRandomness.mockResolvedValue({ success: false, txHash: '', ledger: 0 });

      const result = await service.forceSubmit(15, 'req-15', 'charlie', 'manual', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to submit');
    });

    it('returns failure when txSubmitter throws', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockTxSubmitter.submitRandomness.mockRejectedValue(new Error('network error'));

      const result = await service.forceSubmit(16, 'req-16', 'charlie', 'manual', 100);

      expect(result.success).toBe(false);
    });

    it('logs a FORCE_SUBMIT SUCCESS entry on success', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      await service.forceSubmit(17, 'req-17', 'diana', 'manual', 100);

      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'FORCE_SUBMIT' && l.raffleId === 17);
      expect(entry).toBeDefined();
      expect(entry!.result).toBe('SUCCESS');
      expect(entry!.operator).toBe('diana');
      expect(entry!.details?.txHash).toBe('tx-hash');
    });

    it('logs a FORCE_SUBMIT FAILURE entry when submission fails', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockTxSubmitter.submitRandomness.mockResolvedValue({ success: false, txHash: '' });

      await service.forceSubmit(18, 'req-18', 'diana', 'manual', 100);

      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'FORCE_SUBMIT' && l.result === 'FAILURE');
      expect(entry).toBeDefined();
    });
  });

  // ─── forceFail ────────────────────────────────────────────────────────────────

  describe('forceFail', () => {
    it('removes the job from the queue and reports success', async () => {
      const job = makeQueueJob('jf1', 20, 'req-20');
      mockQueue.getJob.mockResolvedValue(job);

      const result = await service.forceFail('jf1', 'ops', 'invalid request');

      expect(result.success).toBe(true);
      expect(job.remove).toHaveBeenCalledTimes(1);
    });

    it('returns failure when job is not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.forceFail('no-job', 'ops', 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('is idempotent: a second forceFail for the same job ID is safe (job already gone)', async () => {
      const job = makeQueueJob('jf2', 21, 'req-21');
      // First call succeeds, second call finds no job
      mockQueue.getJob
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(null);

      const r1 = await service.forceFail('jf2', 'ops', 'reason');
      const r2 = await service.forceFail('jf2', 'ops', 'reason again');

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(false); // job gone, returns not-found
      expect(job.remove).toHaveBeenCalledTimes(1); // remove called only once
    });

    it('returns failure and logs FAILURE when job.remove throws', async () => {
      const job = makeQueueJob('jf3', 22, 'req-22');
      job.remove.mockRejectedValue(new Error('queue error'));
      mockQueue.getJob.mockResolvedValue(job);

      const result = await service.forceFail('jf3', 'ops', 'test');

      expect(result.success).toBe(false);
      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'FORCE_FAIL' && l.result === 'FAILURE');
      expect(entry).toBeDefined();
    });

    it('logs a FORCE_FAIL SUCCESS entry with operator and reason', async () => {
      const job = makeQueueJob('jf4', 23, 'req-23');
      mockQueue.getJob.mockResolvedValue(job);

      await service.forceFail('jf4', 'eve', 'corrupt payload');

      const logs = service.getRescueLogs();
      const entry = logs.find((l) => l.action === 'FORCE_FAIL' && l.raffleId === 23);
      expect(entry).toBeDefined();
      expect(entry!.result).toBe('SUCCESS');
      expect(entry!.operator).toBe('eve');
      expect(entry!.reason).toBe('corrupt payload');
    });
  });

  // ─── getRescueLogs ────────────────────────────────────────────────────────────

  describe('getRescueLogs', () => {
    it('returns an empty array before any operations', () => {
      expect(service.getRescueLogs()).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      const job = makeQueueJob('jlog', 30, 'req-30');
      job.remove.mockResolvedValue(undefined);
      mockQueue.getJob.mockResolvedValue(job);

      // Generate 3 log entries
      await service.forceFail('jlog', 'ops', 'r1');
      mockQueue.getJob.mockResolvedValue(makeQueueJob('jlog2', 31, 'req-31'));
      await service.forceFail('jlog2', 'ops', 'r2');
      mockQueue.getJob.mockResolvedValue(makeQueueJob('jlog3', 32, 'req-32'));
      await service.forceFail('jlog3', 'ops', 'r3');

      expect(service.getRescueLogs(2)).toHaveLength(2);
      expect(service.getRescueLogs(1)).toHaveLength(1);
    });

    it('returns all logs when limit exceeds log count', async () => {
      const job = makeQueueJob('jlog-all', 40, 'req-40');
      mockQueue.getJob.mockResolvedValue(job);
      await service.forceFail('jlog-all', 'ops', 'reason');

      expect(service.getRescueLogs(999)).toHaveLength(1);
    });
  });

  // ─── getRescueLogsByRaffle ────────────────────────────────────────────────────

  describe('getRescueLogsByRaffle', () => {
    it('filters logs to only the specified raffleId', async () => {
      // raffle 50
      const job50 = makeQueueJob('j50', 50, 'req-50');
      mockQueue.getJob.mockResolvedValue(job50);
      await service.forceFail('j50', 'ops', 'r50');

      // raffle 51
      const job51 = makeQueueJob('j51', 51, 'req-51');
      mockQueue.getJob.mockResolvedValue(job51);
      await service.forceFail('j51', 'ops', 'r51');

      const logs50 = service.getRescueLogsByRaffle(50);
      expect(logs50.every((l) => l.raffleId === 50)).toBe(true);
      expect(logs50).toHaveLength(1);
    });

    it('returns an empty array when no operations were performed for that raffleId', () => {
      expect(service.getRescueLogsByRaffle(9999)).toEqual([]);
    });
  });

  // ─── log rotation cap ─────────────────────────────────────────────────────────

  describe('log rotation', () => {
    it('keeps at most 1000 log entries in memory', async () => {
      // Each forceFail that finds no job still logs a FAILURE entry
      mockQueue.getJob.mockResolvedValue(null);

      for (let i = 0; i < 1005; i++) {
        await service.forceFail(`j${i}`, 'ops', 'stress');
      }

      // The log buffer should not grow beyond 1000
      expect(service.getRescueLogs(2000).length).toBeLessThanOrEqual(1000);
    });
  });
});
