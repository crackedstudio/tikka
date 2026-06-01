import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RandomnessProcessorService } from './randomness-processor.service';
import { JobStateManager } from './job-state-manager';
import { JobState } from './job-state.types';
import { RandomnessMethod } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { RandomnessAuditService } from '../audit/randomness-audit.service';

describe('RandomnessProcessorService', () => {
  let processor: RandomnessProcessorService;
  let stateManager: jest.Mocked<JobStateManager>;
  let contractService: jest.Mocked<ContractService>;
  let vrfService: jest.Mocked<VrfService>;
  let prngService: jest.Mocked<PrngService>;
  let txSubmitter: jest.Mocked<TxSubmitterService>;
  let healthService: jest.Mocked<HealthService>;
  let lagMonitor: jest.Mocked<LagMonitorService>;
  let randomnessAudit: jest.Mocked<RandomnessAuditService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RandomnessProcessorService,
        {
          provide: JobStateManager,
          useValue: {
            getJobMetadata: jest.fn(),
            initializeJob: jest.fn(),
            transitionState: jest.fn(),
            canAcquireProcessingSlot: jest.fn().mockReturnValue(true),
            recordTransactionResult: jest.fn(),
            getConfig: jest.fn().mockReturnValue({
              maxRetries: 5,
              initialBackoffMs: 2000,
              backoffMultiplier: 2,
              maxBackoffMs: 60000,
              confirmationTimeoutMs: 30000,
              maxConcurrency: 10,
              generationTimeoutMs: 15000,
              submissionTimeoutMs: 45000,
            }),
          },
        },
        {
          provide: ContractService,
          useValue: {
            isRandomnessSubmitted: jest.fn(),
            getRaffleData: jest.fn(),
          },
        },
        {
          provide: VrfService,
          useValue: {
            compute: jest.fn(),
          },
        },
        {
          provide: PrngService,
          useValue: {
            compute: jest.fn(),
          },
        },
        {
          provide: TxSubmitterService,
          useValue: {
            submitRandomness: jest.fn(),
            getTransactionConfirmationStatus: jest.fn().mockResolvedValue({
              confirmed: false,
              failed: false,
            }),
          },
        },
        {
          provide: HealthService,
          useValue: {
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
          },
        },
        {
          provide: LagMonitorService,
          useValue: {
            fulfillRequest: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
              if (key === 'VRF_THRESHOLD_XLM') return '500';
              return defaultValue;
            }),
          },
        },
        {
          provide: RandomnessAuditService,
          useValue: {
            ensurePending: jest.fn().mockResolvedValue({}),
            markSucceeded: jest.fn().mockResolvedValue({}),
            markFailed: jest.fn().mockResolvedValue({}),
            markAlreadySubmitted: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    processor = module.get<RandomnessProcessorService>(RandomnessProcessorService);
    stateManager = module.get(JobStateManager) as jest.Mocked<JobStateManager>;
    contractService = module.get(ContractService) as jest.Mocked<ContractService>;
    vrfService = module.get(VrfService) as jest.Mocked<VrfService>;
    prngService = module.get(PrngService) as jest.Mocked<PrngService>;
    txSubmitter = module.get(TxSubmitterService) as jest.Mocked<TxSubmitterService>;
    healthService = module.get(HealthService) as jest.Mocked<HealthService>;
    lagMonitor = module.get(LagMonitorService) as jest.Mocked<LagMonitorService>;
    randomnessAudit = module.get(RandomnessAuditService) as jest.Mocked<RandomnessAuditService>;
  });

  describe('Test 1: Transient Generation Failure', () => {
    it('should move job to RETRYING state on temporary generation error', async () => {
      const request = { requestId: 'req-1', raffleId: 100, prizeAmount: 600 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-1',
        raffleId: 100,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 600 } as any);
      vrfService.compute.mockRejectedValue(new Error('Temporary VRF service unavailable'));

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toContain('Temporary VRF service unavailable');
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-1',
        JobState.GENERATING,
        'Starting generation',
      );
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-1',
        JobState.RETRYING,
        'Generation failed',
        expect.any(String),
      );
      expect(healthService.recordFailure).toHaveBeenCalledWith('req-1', 100, expect.any(String));
    });

    it('should trigger backoff on generation failure', async () => {
      const request = { requestId: 'req-2', raffleId: 101, prizeAmount: 300 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-2',
        raffleId: 101,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 300 } as any);
      (prngService.compute as jest.Mock).mockRejectedValue(new Error('Rate limit exceeded'));

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-2',
        JobState.RETRYING,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('Test 2: Submit Failure', () => {
    it('should trigger retry on transaction submission rejection', async () => {
      const request = { requestId: 'req-3', raffleId: 102, prizeAmount: 700 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-3',
        raffleId: 102,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 700 } as any);
      vrfService.compute.mockResolvedValue({ seed: 'seed-123', proof: 'proof-123' });
      txSubmitter.submitRandomness.mockResolvedValue({
        success: false,
        txHash: '',
        ledger: 0,
      } as any);

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-3',
        JobState.SUBMITTING,
        'Starting submission',
      );
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-3',
        JobState.RETRYING,
        'Submission failed',
        expect.any(String),
      );
    });

    it('should retry on insufficient fee error', async () => {
      const request = { requestId: 'req-4', raffleId: 103, prizeAmount: 800 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-4',
        raffleId: 103,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 800 } as any);
      vrfService.compute.mockResolvedValue({ seed: 'seed-456', proof: 'proof-456' });
      txSubmitter.submitRandomness.mockRejectedValue(new Error('Insufficient fee'));

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toContain('Insufficient fee');
    });
  });

  describe('Test 3: Confirmation Timeout', () => {
    it('should schedule retry when confirmation times out', async () => {
      const request = { requestId: 'req-5', raffleId: 104, prizeAmount: 500 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-5',
        raffleId: 104,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 500 } as any);
      vrfService.compute.mockResolvedValue({ seed: 'seed-789', proof: 'proof-789' });
      txSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx-hash-789',
        ledger: 0,
      } as any);

      // Mock confirmation timeout by making the config have a very short timeout
      stateManager.getConfig.mockReturnValue({
        maxRetries: 5,
        initialBackoffMs: 2000,
        backoffMultiplier: 2,
        maxBackoffMs: 60000,
        confirmationTimeoutMs: 1, // 1ms timeout to force timeout
        maxConcurrency: 10,
        generationTimeoutMs: 15000,
        submissionTimeoutMs: 45000,
      });

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toContain('Confirmation timeout');
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-5',
        JobState.CONFIRMING,
        expect.stringContaining('Confirming tx'),
      );
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-5',
        JobState.RETRYING,
        expect.stringContaining('Confirmation timeout'),
        expect.any(String),
      );
    });
  });

  describe('Test 4: Permanent Failure (Dead-Letter)', () => {
    it('should move to FAILED state on non-retriable error', async () => {
      const request = { requestId: 'req-6', raffleId: 105, prizeAmount: 600 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-6',
        raffleId: 105,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 600 } as any);
      vrfService.compute.mockRejectedValue(new Error('Invalid signature - unauthorized'));

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(false);
      expect(result.error).toContain('Invalid signature');
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-6',
        JobState.FAILED,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should not retry on malformed request error', async () => {
      const request = { requestId: 'req-7', raffleId: 106, prizeAmount: 400 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-7',
        raffleId: 106,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 400 } as any);
      (prngService.compute as jest.Mock).mockResolvedValue({ seed: 'seed-abc', proof: 'proof-abc' });
      txSubmitter.submitRandomness.mockRejectedValue(new Error('Malformed transaction'));

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(false);
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-7',
        JobState.FAILED,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('Test 5: Telemetry Assertions', () => {
    it('should accurately report job state during lifecycle', async () => {
      const request = { requestId: 'req-8', raffleId: 107, prizeAmount: 550 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-8',
        raffleId: 107,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 550 } as any);
      vrfService.compute.mockResolvedValue({ seed: 'seed-def', proof: 'proof-def' });
      txSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx-hash-def',
        ledger: 12345,
      } as any);

      // Mock successful confirmation
      stateManager.getConfig.mockReturnValue({
        maxRetries: 5,
        initialBackoffMs: 2000,
        backoffMultiplier: 2,
        maxBackoffMs: 60000,
        confirmationTimeoutMs: 100, // Short but not immediate
        maxConcurrency: 10,
        generationTimeoutMs: 15000,
        submissionTimeoutMs: 45000,
      });

      await processor.processRequest(request);

      // Verify state transitions were tracked
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-8',
        JobState.GENERATING,
        'Starting generation',
      );
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-8',
        JobState.SUBMITTING,
        'Starting submission',
      );

      // Verify health tracking
      expect(healthService.recordFailure).not.toHaveBeenCalled();
      expect(healthService.recordSuccess).toHaveBeenCalledWith('req-8');
    });

    it('should track failures in telemetry', async () => {
      const request = { requestId: 'req-9', raffleId: 108, prizeAmount: 300 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-9',
        raffleId: 108,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 300 } as any);
      (prngService.compute as jest.Mock).mockRejectedValue(new Error('Service timeout'));

      await processor.processRequest(request);

      expect(healthService.recordFailure).toHaveBeenCalledWith('req-9', 108, expect.any(String));
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-9',
        JobState.RETRYING,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('Success Path', () => {
    it('should complete full lifecycle successfully', async () => {
      const request = { requestId: 'req-success', raffleId: 200, prizeAmount: 1000 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-success',
        raffleId: 200,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 1000 } as any);
      vrfService.compute.mockResolvedValue({ seed: 'seed-success', proof: 'proof-success' });
      txSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx-hash-success',
        ledger: 99999,
      } as any);

      // Mock immediate confirmation
      stateManager.getConfig.mockReturnValue({
        maxRetries: 5,
        initialBackoffMs: 2000,
        backoffMultiplier: 2,
        maxBackoffMs: 60000,
        confirmationTimeoutMs: 100,
        maxConcurrency: 10,
        generationTimeoutMs: 15000,
        submissionTimeoutMs: 45000,
      });

      const result = await processor.processRequest(request);

      // Note: The confirmation will timeout in this test setup since we don't mock the transaction status check
      // In a real implementation, you would mock the checkTransactionStatus method
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-success',
        JobState.GENERATING,
        'Starting generation',
      );
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-success',
        JobState.SUBMITTING,
        'Starting submission',
      );
      expect(healthService.recordSuccess).toHaveBeenCalledWith('req-success');
      expect(randomnessAudit.markSucceeded).toHaveBeenCalled();
    });

    it('should skip processing if already submitted', async () => {
      const request = { requestId: 'req-skip', raffleId: 201, prizeAmount: 500 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-skip',
        raffleId: 201,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await processor.processRequest(request);

      expect(result.success).toBe(true);
      expect(result.shouldRetry).toBe(false);
      expect(stateManager.transitionState).toHaveBeenCalledWith(
        'req-skip',
        JobState.CONFIRMED,
        'Already submitted',
      );
      expect(vrfService.compute).not.toHaveBeenCalled();
      expect(prngService.compute).not.toHaveBeenCalled();
      expect(randomnessAudit.markAlreadySubmitted).toHaveBeenCalledWith('req-skip');
    });

    it('should not mark audit failed on retriable submission errors', async () => {
      const request = { requestId: 'req-retry', raffleId: 202, prizeAmount: 700 };

      stateManager.getJobMetadata.mockReturnValue(undefined);
      stateManager.initializeJob.mockReturnValue({
        requestId: 'req-retry',
        raffleId: 202,
        currentState: JobState.QUEUED,
        attemptCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transitions: [],
      });

      contractService.isRandomnessSubmitted.mockResolvedValue(false);
      contractService.getRaffleData.mockResolvedValue({ prizeAmount: 700 } as any);
      vrfService.compute.mockResolvedValue({ seed: 's', proof: 'p' });
      txSubmitter.submitRandomness.mockResolvedValue({
        success: false,
        txHash: '',
        ledger: 0,
      } as any);

      await processor.processRequest(request);

      expect(randomnessAudit.ensurePending).toHaveBeenCalled();
      expect(randomnessAudit.markFailed).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency Control', () => {
    it('should reject processing when concurrency limit reached', async () => {
      const request = { requestId: 'req-concurrent', raffleId: 300, prizeAmount: 500 };

      stateManager.canAcquireProcessingSlot.mockReturnValue(false);

      const result = await processor.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toContain('Concurrency limit reached');
      expect(contractService.isRandomnessSubmitted).not.toHaveBeenCalled();
    });
  });
});
