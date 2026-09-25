/**
 * End-to-End Rescue Flow Integration Tests
 *
 * Tests stuck-raffle recovery with mocked chain deps (same CI-runnable style as
 * test:e2e:mocked / e2e-oracle-flow):
 * 1. Create a stuck DRAWING raffle (ledger lag + queue age)
 * 2. Detect via stuck-draw report
 * 3. Force-submit rescue
 * 4. Assert resolution and audit log entries
 * 5. Refuse rescue on a healthy (already finalized) raffle
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RescueService } from '../src/rescue/rescue.service';
import { RANDOMNESS_QUEUE } from '../src/queue/randomness.queue';
import { ContractService } from '../src/contract/contract.service';
import { VrfService } from '../src/randomness/vrf.service';
import { PrngService } from '../src/randomness/prng.service';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';
import { HealthService } from '../src/health/health.service';
import { OracleLoggerService } from '../src/logger/oracle-logger';

const E2E_TEST_TIMEOUT = 10000;

describe('E2E Rescue Flow Integration Tests', () => {
  let rescueService: RescueService;
  let mockQueue: {
    getJob: jest.Mock;
    add: jest.Mock;
    getFailed: jest.Mock;
    getWaiting: jest.Mock;
    getActive: jest.Mock;
    getCompleted: jest.Mock;
    getDelayed: jest.Mock;
  };
  let mockContractService: {
    isRandomnessSubmitted: jest.Mock;
    getRaffleData: jest.Mock;
  };
  let mockPrngService: { compute: jest.Mock };
  let mockVrfService: { compute: jest.Mock };
  let mockTxSubmitter: { submitRandomness: jest.Mock };
  let mockLagMonitor: {
    getPendingRequests: jest.Mock;
    getCurrentLedger: jest.Mock;
    getLagThresholdLedgers: jest.Mock;
  };
  let mockHealthService: { getMetrics: jest.Mock };

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
    attemptsMade: overrides.attemptsMade ?? 3,
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
      isRandomnessSubmitted: jest.fn().mockResolvedValue(false),
      getRaffleData: jest.fn(),
    };

    mockVrfService = {
      compute: jest.fn().mockResolvedValue({
        seed: 'a'.repeat(64),
        proof: 'b'.repeat(128),
      }),
    };

    mockPrngService = {
      compute: jest.fn().mockReturnValue({
        seed: 'c'.repeat(64),
        proof: 'd'.repeat(128),
      }),
    };

    mockTxSubmitter = {
      submitRandomness: jest.fn().mockResolvedValue({
        success: true,
        txHash: 'rescue-tx-hash-e2e',
        ledger: 1200,
      }),
    };

    mockLagMonitor = {
      getPendingRequests: jest.fn().mockReturnValue([]),
      getCurrentLedger: jest.fn().mockReturnValue(0),
      getLagThresholdLedgers: jest.fn().mockReturnValue(100),
    };

    mockHealthService = {
      getMetrics: jest.fn().mockReturnValue({ recentErrors: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescueService,
        {
          provide: OracleLoggerService,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
        { provide: getQueueToken(RANDOMNESS_QUEUE), useValue: mockQueue },
        { provide: ContractService, useValue: mockContractService },
        { provide: VrfService, useValue: mockVrfService },
        { provide: PrngService, useValue: mockPrngService },
        { provide: TxSubmitterService, useValue: mockTxSubmitter },
        { provide: LagMonitorService, useValue: mockLagMonitor },
        { provide: HealthService, useValue: mockHealthService },
      ],
    }).compile();

    rescueService = module.get<RescueService>(RescueService);
  });

  it(
    'rescues a stuck raffle via force-submit and records audit entries',
    async () => {
      const raffleId = 101;
      const requestId = 'req-stuck-e2e-001';
      const operator = 'e2e-operator';
      const reason = 'E2E stuck raffle recovery';
      const requestedAtLedger = 1000;
      const currentLedger = 1150;
      const ageMs = 10 * 60 * 1000;

      // Stuck state: DRAWING on-chain, ledger lag past threshold, aged queue job
      mockLagMonitor.getPendingRequests.mockReturnValue([
        {
          requestId,
          raffleId,
          requestedAtLedger,
          timestamp: new Date(Date.now() - ageMs),
        },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(currentLedger);
      mockQueue.getActive.mockResolvedValue([
        makeQueueJob('job-stuck-e2e', raffleId, requestId, 'active', {
          timestamp: Date.now() - ageMs,
        }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 100,
        status: 'DRAWING',
        ticketsSold: 10,
      });
      mockContractService.isRandomnessSubmitted.mockResolvedValue(false);

      const stuckReport = await rescueService.getStuckDrawReport();
      const stuckEntry = stuckReport.entries.find((e) => e.requestId === requestId);

      expect(stuckEntry).toBeDefined();
      expect(stuckEntry!.status).toBe('stuck');
      expect(stuckEntry!.contractStatus).toBe('DRAWING');
      expect(stuckEntry!.ledgerRange.lagLedgers).toBe(150);
      expect(stuckEntry!.nextStep).toContain('force-submit');
      expect(stuckReport.summary.stuck).toBeGreaterThanOrEqual(1);

      const result = await rescueService.forceSubmit(
        raffleId,
        requestId,
        operator,
        reason,
        100,
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('rescue-tx-hash-e2e');
      expect(mockPrngService.compute).toHaveBeenCalledWith(requestId);
      expect(mockTxSubmitter.submitRandomness).toHaveBeenCalledWith(
        raffleId,
        expect.objectContaining({
          seed: expect.any(String),
          proof: expect.any(String),
        }),
      );

      const auditLogs = rescueService.getRescueLogsByRaffle(raffleId);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toEqual(
        expect.objectContaining({
          action: 'FORCE_SUBMIT',
          raffleId,
          requestId,
          operator,
          reason,
          result: 'SUCCESS',
        }),
      );
      expect(auditLogs[0].details).toEqual(
        expect.objectContaining({
          txHash: 'rescue-tx-hash-e2e',
          ledger: 1200,
          method: 'PRNG',
        }),
      );

      // After rescue, contract is finalized — report resolves to confirmed
      mockContractService.getRaffleData.mockResolvedValue({
        raffleId,
        prizeAmount: 100,
        status: 'FINALIZED',
        ticketsSold: 10,
      });
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([
        makeQueueJob('job-stuck-e2e', raffleId, requestId, 'completed', {
          timestamp: Date.now() - ageMs,
        }),
      ]);
      mockLagMonitor.getPendingRequests.mockReturnValue([]);

      const resolvedReport = await rescueService.getStuckDrawReport();
      const resolvedEntry = resolvedReport.entries.find(
        (e) => e.requestId === requestId,
      );

      expect(resolvedEntry!.status).toBe('confirmed');
      expect(resolvedEntry!.contractStatus).toBe('FINALIZED');
      expect(resolvedEntry!.nextStep).toContain('No action required');
    },
    E2E_TEST_TIMEOUT,
  );

  it(
    'refuses rescue on a healthy (already finalized) raffle',
    async () => {
      const raffleId = 202;
      const requestId = 'req-healthy-e2e-002';

      mockContractService.isRandomnessSubmitted.mockResolvedValue(true);

      const result = await rescueService.forceSubmit(
        raffleId,
        requestId,
        'e2e-operator',
        'should be refused — raffle already healthy/finalized',
        100,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('already finalized');
      expect(mockPrngService.compute).not.toHaveBeenCalled();
      expect(mockVrfService.compute).not.toHaveBeenCalled();
      expect(mockTxSubmitter.submitRandomness).not.toHaveBeenCalled();

      // Healthy-raffle guard: no successful rescue audit entry
      const auditLogs = rescueService.getRescueLogsByRaffle(raffleId);
      expect(auditLogs.filter((l) => l.result === 'SUCCESS')).toHaveLength(0);
    },
    E2E_TEST_TIMEOUT,
  );
});
