import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RescueService } from './rescue.service';
import { RANDOMNESS_QUEUE } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { HealthService } from '../health/health.service';

describe('RescueService', () => {
  let service: RescueService;
  let mockQueue: any;
  let mockContractService: any;
  let mockVrfService: any;
  let mockPrngService: any;
  let mockTxSubmitter: any;
  let mockLagMonitor: any;
  let mockHealthService: any;

  const makeQueueJob = (
    id: string,
    raffleId: number,
    requestId: string,
    state: string,
    overrides: Partial<{
      failedReason: string;
      timestamp: number;
      attemptsMade: number;
    }> = {},
  ) => ({
    id,
    data: { raffleId, requestId },
    attemptsMade: overrides.attemptsMade ?? 1,
    failedReason: overrides.failedReason,
    timestamp: overrides.timestamp ?? Date.now(),
    getState: jest.fn().mockResolvedValue(state),
  });

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

    mockVrfService = {
      compute: jest.fn(),
    };

    mockPrngService = {
      compute: jest.fn(),
    };

    mockTxSubmitter = {
      submitRandomness: jest.fn(),
    };

    mockLagMonitor = {
      getPendingRequests: jest.fn().mockReturnValue([]),
      getCurrentLedger: jest.fn().mockReturnValue(0),
      getLagThresholdLedgers: jest.fn().mockReturnValue(100),
    };

    mockHealthService = {
      getMetrics: jest.fn().mockReturnValue({
        recentErrors: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescueService,
        {
          provide: getQueueToken(RANDOMNESS_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: ContractService,
          useValue: mockContractService,
        },
        {
          provide: VrfService,
          useValue: mockVrfService,
        },
        {
          provide: PrngService,
          useValue: mockPrngService,
        },
        {
          provide: TxSubmitterService,
          useValue: mockTxSubmitter,
        },
        {
          provide: LagMonitorService,
          useValue: mockLagMonitor,
        },
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    service = module.get<RescueService>(RescueService);
  });

  describe('reEnqueueJob', () => {
    it('should re-enqueue a failed job successfully', async () => {
      const jobId = '12345';
      const operator = 'alice';
      const reason = 'RPC timeout';
      const payload = { raffleId: 42, requestId: 'req_123' };

      const mockJob = {
        id: jobId,
        data: payload,
      };

      const mockNewJob = {
        id: '12346',
      };

      mockQueue.getJob.mockResolvedValue(mockJob);
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockQueue.add.mockResolvedValue(mockNewJob);

      const result = await service.reEnqueueJob(jobId, operator, reason);

      expect(result.success).toBe(true);
      expect(result.newJobId).toBe('12346');
      expect(mockQueue.add).toHaveBeenCalledWith(payload, expect.any(Object));
    });

    it('should fail if job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.reEnqueueJob('99999', 'alice', 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should fail if raffle already finalized', async () => {
      const mockJob = {
        id: '12345',
        data: { raffleId: 42, requestId: 'req_123' },
      };

      mockQueue.getJob.mockResolvedValue(mockJob);
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.reEnqueueJob('12345', 'alice', 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
    });
  });

  describe('forceSubmit', () => {
    it('should force submit randomness for low-stakes raffle', async () => {
      const raffleId = 42;
      const requestId = 'req_123';
      const operator = 'bob';
      const reason = 'Manual intervention';
      const prizeAmount = 100;

      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockPrngService.compute.mockResolvedValue({
        seed: 'seed123',
        proof: 'proof123',
      });
      mockTxSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx123',
        ledger: 12345,
      });

      const result = await service.forceSubmit(
        raffleId,
        requestId,
        operator,
        reason,
        prizeAmount,
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('tx123');
      expect(mockPrngService.compute).toHaveBeenCalledWith(requestId);
      expect(mockVrfService.compute).not.toHaveBeenCalled();
    });

    it('should force submit randomness for high-stakes raffle', async () => {
      const raffleId = 42;
      const requestId = 'req_123';
      const operator = 'bob';
      const reason = 'Manual intervention';
      const prizeAmount = 1000;

      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockVrfService.compute.mockResolvedValue({
        seed: 'seed123',
        proof: 'proof123',
      });
      mockTxSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx123',
        ledger: 12345,
      });

      const result = await service.forceSubmit(
        raffleId,
        requestId,
        operator,
        reason,
        prizeAmount,
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('tx123');
      expect(mockVrfService.compute).toHaveBeenCalledWith(requestId);
      expect(mockPrngService.compute).not.toHaveBeenCalled();
    });

    it('should fetch prize amount from contract if not provided', async () => {
      const raffleId = 42;
      const requestId = 'req_123';

      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockContractService.getRaffleData.mockResolvedValue({
        raffleId: 42,
        prizeAmount: 750,
        status: 'ACTIVE',
      });
      mockVrfService.compute.mockResolvedValue({
        seed: 'seed123',
        proof: 'proof123',
      });
      mockTxSubmitter.submitRandomness.mockResolvedValue({
        success: true,
        txHash: 'tx123',
        ledger: 12345,
      });

      const result = await service.forceSubmit(raffleId, requestId, 'bob', 'test');

      expect(result.success).toBe(true);
      expect(mockContractService.getRaffleData).toHaveBeenCalledWith(raffleId);
      expect(mockVrfService.compute).toHaveBeenCalled();
    });

    it('should fail if raffle already finalized', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await service.forceSubmit(42, 'req_123', 'bob', 'test', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
    });

    it('should fail if transaction submission fails', async () => {
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);
      mockPrngService.compute.mockResolvedValue({
        seed: 'seed123',
        proof: 'proof123',
      });
      mockTxSubmitter.submitRandomness.mockResolvedValue({
        success: false,
        txHash: '',
        ledger: 0,
      });

      const result = await service.forceSubmit(42, 'req_123', 'bob', 'test', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to submit');
    });
  });

  describe('forceFail', () => {
    it('should force fail a job successfully', async () => {
      const jobId = '12345';
      const operator = 'alice';
      const reason = 'Invalid raffle ID';

      const mockJob = {
        id: jobId,
        data: { raffleId: 42, requestId: 'req_123' },
        remove: jest.fn().mockResolvedValue(true),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.forceFail(jobId, operator, reason);

      expect(result.success).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should fail if job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.forceFail('99999', 'alice', 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('getFailedJobs', () => {
    it('should return list of failed jobs', async () => {
      const mockFailedJobs = [
        {
          id: '12345',
          data: { raffleId: 42, requestId: 'req_123' },
          attemptsMade: 5,
          failedReason: 'RPC timeout',
          timestamp: Date.now(),
          getState: jest.fn().mockResolvedValue('failed'),
        },
        {
          id: '12346',
          data: { raffleId: 43, requestId: 'req_456' },
          attemptsMade: 5,
          failedReason: 'Contract error',
          timestamp: Date.now(),
          getState: jest.fn().mockResolvedValue('failed'),
        },
      ];

      mockQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const result = await service.getFailedJobs();

      expect(result).toHaveLength(2);
      expect(result[0].raffleId).toBe(42);
      expect(result[1].raffleId).toBe(43);
    });
  });

  describe('getRescueLogs', () => {
    it('should return rescue logs', async () => {
      // Perform some operations to generate logs
      const mockJob = {
        id: '12345',
        data: { raffleId: 42, requestId: 'req_123' },
        remove: jest.fn().mockResolvedValue(true),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);
      await service.forceFail('12345', 'alice', 'test');

      const logs = service.getRescueLogs();

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('FORCE_FAIL');
      expect(logs[0].operator).toBe('alice');
    });

    it('should limit logs to specified amount', async () => {
      const logs = service.getRescueLogs(10);

      expect(logs.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getStuckDrawReport', () => {
    it('classifies a ledger-lagged DRAWING request as stuck with force-submit guidance', async () => {
      const raffleId = 10;
      const requestId = 'req-stuck';

      mockLagMonitor.getPendingRequests.mockReturnValue([
        {
          requestId,
          raffleId,
          requestedAtLedger: 1000,
          timestamp: new Date(Date.now() - 10 * 60 * 1000),
        },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(1150);

      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([
        makeQueueJob('job-stuck', raffleId, requestId, 'active', {
          timestamp: Date.now() - 10 * 60 * 1000,
        }),
      ]);

      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 100,
        status: 'DRAWING',
      });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId);

      expect(entry).toBeDefined();
      expect(entry!.status).toBe('stuck');
      expect(entry!.ledgerRange.lagLedgers).toBe(150);
      expect(entry!.ledgerRange.requestedAtLedger).toBe(1000);
      expect(entry!.ledgerRange.currentLedger).toBe(1150);
      expect(entry!.lastError).toBeNull();
      expect(entry!.nextStep).toContain('force-submit');
      expect(entry!.signals).toEqual(
        expect.arrayContaining(['contract:DRAWING', 'ledger_lag:150']),
      );
      expect(report.summary.stuck).toBe(1);
    });

    it('classifies a young active request as pending (healthy)', async () => {
      const raffleId = 20;
      const requestId = 'req-pending';

      mockLagMonitor.getPendingRequests.mockReturnValue([
        {
          requestId,
          raffleId,
          requestedAtLedger: 5000,
          timestamp: new Date(Date.now() - 30 * 1000),
        },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(5020);

      mockQueue.getActive.mockResolvedValue([
        makeQueueJob('job-pending', raffleId, requestId, 'active', {
          timestamp: Date.now() - 30 * 1000,
        }),
      ]);

      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 50,
        status: 'DRAWING',
      });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId);

      expect(entry!.status).toBe('pending');
      expect(entry!.ledgerRange.lagLedgers).toBe(20);
      expect(entry!.ageMs).toBeLessThan(2 * 60 * 1000);
      expect(entry!.nextStep).toContain('No action required');
      expect(entry!.signals).toEqual(
        expect.arrayContaining(['ledger_lag_healthy:20']),
      );
      expect(entry!.signals.some((s) => s.startsWith('queue_age_healthy'))).toBe(true);
      expect(report.summary.pending).toBe(1);
    });

    it('classifies a finalized contract / completed job as confirmed', async () => {
      const raffleId = 30;
      const requestId = 'req-confirmed';

      mockQueue.getCompleted.mockResolvedValue([
        makeQueueJob('job-done', raffleId, requestId, 'completed', {
          timestamp: Date.now() - 60 * 60 * 1000,
        }),
      ]);

      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 200,
        status: 'FINALIZED',
      });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId);

      expect(entry!.status).toBe('confirmed');
      expect(entry!.contractStatus).toBe('FINALIZED');
      expect(entry!.queueState).toBe('completed');
      expect(entry!.nextStep).toContain('No action required');
      expect(entry!.signals).toContain('contract:FINALIZED');
      expect(report.summary.confirmed).toBe(1);
    });

    it('classifies a failed queue job as failed with re-enqueue guidance', async () => {
      const raffleId = 40;
      const requestId = 'req-failed';

      mockQueue.getFailed.mockResolvedValue([
        makeQueueJob('job-failed', raffleId, requestId, 'failed', {
          failedReason: 'RPC timeout',
          attemptsMade: 5,
          timestamp: Date.now() - 3 * 60 * 1000,
        }),
      ]);

      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 80,
        status: 'DRAWING',
      });

      mockHealthService.getMetrics.mockReturnValue({
        recentErrors: [
          {
            requestId,
            raffleId,
            error: 'RPC timeout',
            timestamp: new Date(),
          },
        ],
      });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId);

      expect(entry!.status).toBe('failed');
      expect(entry!.queueState).toBe('failed');
      expect(entry!.lastError).toBe('RPC timeout');
      expect(entry!.nextStep).toContain('re-enqueue job-failed');
      expect(entry!.signals).toContain('has_last_error');
      expect(report.summary.failed).toBe(1);
    });

    it('returns report metadata and summary counts', async () => {
      mockLagMonitor.getCurrentLedger.mockReturnValue(9999);

      const report = await service.getStuckDrawReport();

      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.currentLedger).toBe(9999);
      expect(report.thresholds.stuckLedgerLag).toBe(100);
      expect(report.summary).toEqual({
        stuck: 0,
        pending: 0,
        confirmed: 0,
        failed: 0,
        total: 0,
      });
    });
  });

  describe('getRescueLogsByRaffle', () => {
    it('should filter logs by raffle ID', async () => {
      // Generate some logs
      const mockJob = {
        id: '12345',
        data: { raffleId: 42, requestId: 'req_123' },
        remove: jest.fn().mockResolvedValue(true),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);
      await service.forceFail('12345', 'alice', 'test');

      const logs = service.getRescueLogsByRaffle(42);

      expect(logs.every((log) => log.raffleId === 42)).toBe(true);
    });
  });
});
