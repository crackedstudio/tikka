import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RescuePlannerService } from './rescue-planner.service';
import { RANDOMNESS_QUEUE } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { RandomnessMethod } from '../queue/queue.types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const PRNG_RESULT = { seed: 'prng-seed', proof: 'prng-proof' };
const VRF_RESULT = { seed: 'vrf-seed', proof: 'vrf-proof' };

const FEE_ESTIMATE_STUB = { feeStroops: 100, networkPassphrase: 'Test SDF', sourceAddress: 'GTEST', contractId: 'C1', rpcUrl: 'http://rpc', feeEstimate: {} };

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
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('RescuePlannerService', () => {
  let service: RescuePlannerService;
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
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getDelayed: jest.fn().mockResolvedValue([]),
    };

    mockContractService = {
      isRandomnessSubmitted: jest.fn(),
      getRaffleData: jest.fn(),
    };

    mockVrfService = { compute: jest.fn().mockResolvedValue(VRF_RESULT) };
    mockPrngService = { compute: jest.fn().mockResolvedValue(PRNG_RESULT) };
    mockTxSubmitter = {
      estimateRandomnessSubmission: jest.fn().mockResolvedValue(FEE_ESTIMATE_STUB),
      submitRandomness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescuePlannerService,
        { provide: getQueueToken(RANDOMNESS_QUEUE), useValue: mockQueue },
        { provide: ContractService, useValue: mockContractService },
        { provide: VrfService, useValue: mockVrfService },
        { provide: PrngService, useValue: mockPrngService },
        { provide: TxSubmitterService, useValue: mockTxSubmitter },
      ],
    }).compile();

    service = module.get<RescuePlannerService>(RescuePlannerService);
  });

  // ─── getForceSubmitPreview ────────────────────────────────────────────────────

  describe('getForceSubmitPreview', () => {
    it('returns a preview with PRNG method for a low-stakes raffle (<500 XLM)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const result = await service.getForceSubmitPreview(1, 'req-1', 100);

      expect(result.success).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview!.method).toBe(RandomnessMethod.PRNG);
      expect(result.preview!.raffleId).toBe(1);
      expect(result.preview!.requestId).toBe('req-1');
      expect(result.preview!.prizeAmount).toBe(100);
      expect(mockPrngService.compute).toHaveBeenCalledWith('req-1');
      expect(mockVrfService.compute).not.toHaveBeenCalled();
    });

    it('returns a preview with VRF method for a high-stakes raffle (≥500 XLM)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const result = await service.getForceSubmitPreview(2, 'req-2', 500);

      expect(result.success).toBe(true);
      expect(result.preview!.method).toBe(RandomnessMethod.VRF);
      expect(mockVrfService.compute).toHaveBeenCalledWith('req-2');
      expect(mockPrngService.compute).not.toHaveBeenCalled();
    });

    it('fetches prizeAmount from contract when not supplied', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId: 3, prizeAmount: 800, status: 'DRAWING' });

      const result = await service.getForceSubmitPreview(3, 'req-3');

      expect(mockContractService.getRaffleData).toHaveBeenCalledWith(3);
      expect(result.preview!.prizeAmount).toBe(800);
      expect(result.preview!.method).toBe(RandomnessMethod.VRF); // 800 >= 500
    });

    it('returns failure when raffle is already finalized (idempotency guard)', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.getForceSubmitPreview(4, 'req-4', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
      expect(result.preview).toBeUndefined();
    });

    it('is idempotent: calling twice for the same finalized raffle returns failure both times', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const r1 = await service.getForceSubmitPreview(5, 'req-5', 100);
      const r2 = await service.getForceSubmitPreview(5, 'req-5', 100);

      expect(r1.success).toBe(false);
      expect(r2.success).toBe(false);
    });

    it('returns failure gracefully when estimateRandomnessSubmission throws', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockTxSubmitter.estimateRandomnessSubmission.mockRejectedValue(new Error('RPC down'));

      const result = await service.getForceSubmitPreview(6, 'req-6', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to build preview');
    });

    it('includes fee estimate and network info from the submitter in the preview', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      const feeStub = {
        ...FEE_ESTIMATE_STUB,
        networkPassphrase: 'Test SDF Network ; September 2015',
        sourceAddress: 'GSOURCE',
        contractId: 'CONTRACT_ID',
        rpcUrl: 'https://soroban-rpc',
        feeEstimate: { base: 100, surge: 0 },
      };
      mockTxSubmitter.estimateRandomnessSubmission.mockResolvedValue(feeStub);

      const result = await service.getForceSubmitPreview(7, 'req-7', 100);

      expect(result.preview!.network).toBe(feeStub.networkPassphrase);
      expect(result.preview!.sourceAccount).toBe(feeStub.sourceAddress);
      expect(result.preview!.contractId).toBe(feeStub.contractId);
      expect(result.preview!.rpcUrl).toBe(feeStub.rpcUrl);
      expect(result.preview!.feeEstimate).toEqual(feeStub.feeEstimate);
    });
  });

  // ─── previewReEnqueueJob ──────────────────────────────────────────────────────

  describe('previewReEnqueueJob', () => {
    it('returns a successful preview when the job exists and raffle is not finalized', async () => {
      mockQueue.getJob.mockResolvedValue(makeQueueJob('j1', 10, 'req-10'));
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const result = await service.previewReEnqueueJob('j1');

      expect(result.success).toBe(true);
      expect(result.preview).toMatchObject({
        jobId: 'j1',
        raffleId: 10,
        requestId: 'req-10',
        alreadyFinalized: false,
      });
    });

    it('returns failure when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.previewReEnqueueJob('no-job');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('returns failure (with alreadyFinalized flag) when raffle is already finalized', async () => {
      mockQueue.getJob.mockResolvedValue(makeQueueJob('j2', 11, 'req-11'));
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.previewReEnqueueJob('j2');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
      expect(result.preview?.alreadyFinalized).toBe(true);
    });

    it('is idempotent: calling twice for a finalized raffle always returns failure', async () => {
      mockQueue.getJob.mockResolvedValue(makeQueueJob('j3', 12, 'req-12'));
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const r1 = await service.previewReEnqueueJob('j3');
      const r2 = await service.previewReEnqueueJob('j3');

      expect(r1.success).toBe(false);
      expect(r2.success).toBe(false);
    });
  });

  // ─── previewForceFailJob ──────────────────────────────────────────────────────

  describe('previewForceFailJob', () => {
    it('returns a preview with raffle details when job exists', async () => {
      mockQueue.getJob.mockResolvedValue(makeQueueJob('j4', 20, 'req-20'));

      const result = await service.previewForceFailJob('j4');

      expect(result.success).toBe(true);
      expect(result.preview).toMatchObject({
        jobId: 'j4',
        raffleId: 20,
        requestId: 'req-20',
      });
    });

    it('returns failure when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.previewForceFailJob('missing');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('is idempotent: multiple previews for the same job return the same details', async () => {
      mockQueue.getJob.mockResolvedValue(makeQueueJob('j5', 21, 'req-21'));

      const r1 = await service.previewForceFailJob('j5');
      const r2 = await service.previewForceFailJob('j5');

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r1.preview).toEqual(r2.preview);
    });
  });

  // ─── method selection ─────────────────────────────────────────────────────────

  describe('randomness method selection', () => {
    const cases: Array<[number, RandomnessMethod]> = [
      [0, RandomnessMethod.PRNG],
      [499, RandomnessMethod.PRNG],
      [500, RandomnessMethod.VRF],
      [501, RandomnessMethod.VRF],
      [10_000, RandomnessMethod.VRF],
    ];

    it.each(cases)(
      'selects %s XLM → %s',
      async (prizeAmount, expectedMethod) => {
        mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

        const result = await service.getForceSubmitPreview(99, 'req-99', prizeAmount);

        expect(result.preview!.method).toBe(expectedMethod);
      },
    );
  });
});
