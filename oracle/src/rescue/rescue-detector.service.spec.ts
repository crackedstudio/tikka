import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { RescueDetectorService, JobInfo } from './rescue-detector.service';
import { RANDOMNESS_QUEUE } from '../queue/randomness.queue';
import { ContractService } from '../contract/contract.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { HealthService } from '../health/health.service';
import { MetricsService } from '../metrics/metrics.service';
import { OracleLoggerService } from '../logger/oracle-logger';

// ─── helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now();

/** Minimal Bull Job-alike accepted by mapJobToInfo */
function makeJob(
  id: string,
  raffleId: number,
  requestId: string,
  state: string,
  overrides: Partial<{ failedReason: string; timestamp: number; attemptsMade: number }> = {},
) {
  return {
    id,
    data: { raffleId, requestId },
    attemptsMade: overrides.attemptsMade ?? 1,
    failedReason: overrides.failedReason,
    timestamp: overrides.timestamp ?? NOW,
    getState: jest.fn().mockResolvedValue(state),
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('RescueDetectorService', () => {
  let service: RescueDetectorService;
  let mockQueue: jest.Mocked<any>;
  let mockContractService: jest.Mocked<any>;
  let mockLagMonitor: jest.Mocked<any>;
  let mockHealthService: jest.Mocked<any>;
  let mockMetricsService: jest.Mocked<any>;

  // STUCK_LEDGER_LAG is read from lagMonitor.getLagThresholdLedgers() in the ctor
  const STUCK_LEDGER_LAG = 100;

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

    mockLagMonitor = {
      getPendingRequests: jest.fn().mockReturnValue([]),
      getCurrentLedger: jest.fn().mockReturnValue(0),
      getLagThresholdLedgers: jest.fn().mockReturnValue(STUCK_LEDGER_LAG),
    };

    mockHealthService = {
      getMetrics: jest.fn().mockReturnValue({ recentErrors: [] }),
    };

    mockMetricsService = {
      recordStuckDrawState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RescueDetectorService,
        {
          provide: OracleLoggerService,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        },
        { provide: getQueueToken(RANDOMNESS_QUEUE), useValue: mockQueue },
        { provide: ContractService, useValue: mockContractService },
        { provide: LagMonitorService, useValue: mockLagMonitor },
        { provide: HealthService, useValue: mockHealthService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<RescueDetectorService>(RescueDetectorService);
  });

  // ─── getFailedJobs ───────────────────────────────────────────────────────────

  describe('getFailedJobs', () => {
    it('returns mapped JobInfo for every failed Bull job', async () => {
      mockQueue.getFailed.mockResolvedValue([
        makeJob('j1', 10, 'req-10', 'failed', { failedReason: 'RPC timeout', attemptsMade: 5 }),
        makeJob('j2', 11, 'req-11', 'failed', { failedReason: 'Contract error', attemptsMade: 3 }),
      ]);

      const result = await service.getFailedJobs();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject<Partial<JobInfo>>({
        id: 'j1',
        raffleId: 10,
        requestId: 'req-10',
        failedReason: 'RPC timeout',
        attempts: 5,
        state: 'failed',
      });
      expect(result[1].raffleId).toBe(11);
    });

    it('returns an empty array when the queue has no failed jobs', async () => {
      const result = await service.getFailedJobs();
      expect(result).toEqual([]);
    });
  });

  // ─── getAllJobs ───────────────────────────────────────────────────────────────

  describe('getAllJobs', () => {
    it('returns jobs partitioned by state', async () => {
      mockQueue.getWaiting.mockResolvedValue([makeJob('w1', 1, 'rw1', 'waiting')]);
      mockQueue.getActive.mockResolvedValue([makeJob('a1', 2, 'ra1', 'active')]);
      mockQueue.getCompleted.mockResolvedValue([makeJob('c1', 3, 'rc1', 'completed')]);
      mockQueue.getFailed.mockResolvedValue([makeJob('f1', 4, 'rf1', 'failed')]);
      mockQueue.getDelayed.mockResolvedValue([makeJob('d1', 5, 'rd1', 'delayed')]);

      const all = await service.getAllJobs();

      expect(all.waiting).toHaveLength(1);
      expect(all.waiting[0].id).toBe('w1');
      expect(all.active[0].raffleId).toBe(2);
      expect(all.completed[0].state).toBe('completed');
      expect(all.failed[0].id).toBe('f1');
      expect(all.delayed[0].raffleId).toBe(5);
    });
  });

  // ─── getStuckDrawReport — report metadata ────────────────────────────────────

  describe('getStuckDrawReport — metadata', () => {
    it('stamps the report with an ISO-8601 timestamp and currentLedger', async () => {
      mockLagMonitor.getCurrentLedger.mockReturnValue(12345);

      const report = await service.getStuckDrawReport();

      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.currentLedger).toBe(12345);
    });

    it('exposes the configured thresholds verbatim', async () => {
      const report = await service.getStuckDrawReport();

      expect(report.thresholds.stuckLedgerLag).toBe(STUCK_LEDGER_LAG);
      expect(report.thresholds.stuckQueueAgeMs).toBe(5 * 60 * 1000);
      expect(report.thresholds.pendingHealthyMaxLedgerLag).toBe(50);
      expect(report.thresholds.pendingHealthyMaxAgeMs).toBe(2 * 60 * 1000);
    });

    it('returns empty entries and zeroed summary when nothing is tracked', async () => {
      const report = await service.getStuckDrawReport();

      expect(report.entries).toHaveLength(0);
      expect(report.summary).toEqual({ stuck: 0, pending: 0, confirmed: 0, failed: 0, total: 0 });
    });

    it('records stuck-draw metrics via MetricsService', async () => {
      const report = await service.getStuckDrawReport();

      expect(mockMetricsService.recordStuckDrawState).toHaveBeenCalledWith(
        report.summary.stuck,
        expect.any(Number),
      );
    });
  });

  // ─── stuck-draw class: LEDGER LAG ────────────────────────────────────────────

  describe('classification — ledger-lag stuck', () => {
    it('classifies a DRAWING request with lag ≥ threshold as stuck', async () => {
      const raffleId = 10;
      const requestId = 'req-ledger-stuck';
      const requestedAtLedger = 1000;
      const currentLedger = 1000 + STUCK_LEDGER_LAG; // exactly at threshold

      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger, timestamp: new Date(NOW - 10 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(currentLedger);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 100, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
      expect(entry.ledgerRange.lagLedgers).toBe(STUCK_LEDGER_LAG);
      expect(entry.signals).toContain(`ledger_lag:${STUCK_LEDGER_LAG}`);
      expect(entry.signals).toContain('contract:DRAWING');
      expect(entry.nextStep).toContain('force-submit');
      expect(report.summary.stuck).toBe(1);
    });

    it('classifies a request with lag > threshold as stuck (above boundary)', async () => {
      const raffleId = 11;
      const requestId = 'req-ledger-over';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 500, timestamp: new Date(NOW - 15 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(500 + STUCK_LEDGER_LAG + 50);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
    });

    it('does NOT flag a request whose lag is below the threshold (false-positive guard)', async () => {
      const raffleId = 12;
      const requestId = 'req-ledger-ok';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 2000, timestamp: new Date(NOW - 30_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(2000 + STUCK_LEDGER_LAG - 1); // one below threshold
      mockQueue.getActive.mockResolvedValue([makeJob('j-ok', raffleId, requestId, 'active', { timestamp: NOW - 30_000 })]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).not.toBe('stuck');
    });

    it('does NOT flag a resolved (FINALIZED) draw even if ledger lag would exceed threshold', async () => {
      const raffleId = 13;
      const requestId = 'req-ledger-finalized';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 100, timestamp: new Date(NOW - 20 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(100 + STUCK_LEDGER_LAG + 200);
      // Queue job is completed
      mockQueue.getCompleted.mockResolvedValue([
        makeJob('j-fin', raffleId, requestId, 'completed', { timestamp: NOW - 20 * 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 200, status: 'FINALIZED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
      expect(entry.status).not.toBe('stuck');
    });

    it('does NOT flag a CANCELLED draw even if ledger lag exceeds threshold', async () => {
      const raffleId = 14;
      const requestId = 'req-cancelled';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 200, timestamp: new Date(NOW - 30 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(200 + STUCK_LEDGER_LAG + 100);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 0, status: 'CANCELLED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
    });
  });

  // ─── stuck-draw class: QUEUE AGE ─────────────────────────────────────────────

  describe('classification — queue-age stuck', () => {
    const STUCK_QUEUE_AGE_MS = 5 * 60_000;

    it('classifies a waiting job older than STUCK_QUEUE_AGE_MS as stuck', async () => {
      const raffleId = 20;
      const requestId = 'req-age-waiting';
      mockQueue.getWaiting.mockResolvedValue([
        makeJob('j-w', raffleId, requestId, 'waiting', { timestamp: NOW - STUCK_QUEUE_AGE_MS - 1 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
      expect(entry.signals.some((s) => s.startsWith('queue_age_exceeded'))).toBe(true);
      expect(entry.nextStep).toContain('force-submit');
    });

    it('classifies an active job older than STUCK_QUEUE_AGE_MS as stuck', async () => {
      const raffleId = 21;
      const requestId = 'req-age-active';
      mockQueue.getActive.mockResolvedValue([
        makeJob('j-a', raffleId, requestId, 'active', { timestamp: NOW - STUCK_QUEUE_AGE_MS - 1 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
    });

    it('classifies a delayed job older than STUCK_QUEUE_AGE_MS as stuck', async () => {
      const raffleId = 22;
      const requestId = 'req-age-delayed';
      mockQueue.getDelayed.mockResolvedValue([
        makeJob('j-d', raffleId, requestId, 'delayed', { timestamp: NOW - STUCK_QUEUE_AGE_MS - 1 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
    });

    it('does NOT flag a young waiting job (false-positive: draw in flight)', async () => {
      const raffleId = 23;
      const requestId = 'req-young-waiting';
      mockQueue.getWaiting.mockResolvedValue([
        makeJob('j-young', raffleId, requestId, 'waiting', { timestamp: NOW - 30_000 }), // 30 s old
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).not.toBe('stuck');
    });

    it('does NOT flag a completed job regardless of age (resolved onchain guard)', async () => {
      const raffleId = 24;
      const requestId = 'req-old-completed';
      mockQueue.getCompleted.mockResolvedValue([
        makeJob('j-done', raffleId, requestId, 'completed', { timestamp: NOW - 2 * 60 * 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 500, status: 'FINALIZED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
    });
  });

  // ─── stuck-draw class: DRAWING + mixed signals ───────────────────────────────

  describe('classification — contract DRAWING combined with queue state', () => {
    it('classifies DRAWING + ledger lag as stuck', async () => {
      const raffleId = 30;
      const requestId = 'req-drawing-lag';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 1000, timestamp: new Date(NOW - 10 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(1000 + STUCK_LEDGER_LAG + 10);
      mockQueue.getActive.mockResolvedValue([
        makeJob('j-act', raffleId, requestId, 'active', { timestamp: NOW - 8 * 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 100, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
      expect(entry.contractStatus).toBe('DRAWING');
    });

    it('classifies DRAWING + queue age exceeded as stuck', async () => {
      const raffleId = 31;
      const requestId = 'req-drawing-age';
      mockLagMonitor.getCurrentLedger.mockReturnValue(5000);
      // Lag monitor has no pending for this raffle → no ledgerRange data
      mockQueue.getWaiting.mockResolvedValue([
        makeJob('j-wait', raffleId, requestId, 'waiting', { timestamp: NOW - 6 * 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 80, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('stuck');
    });
  });

  // ─── classification: FAILED ───────────────────────────────────────────────────

  describe('classification — failed queue job', () => {
    it('classifies a failed Bull job as failed with re-enqueue guidance', async () => {
      const raffleId = 40;
      const requestId = 'req-failed';
      mockQueue.getFailed.mockResolvedValue([
        makeJob('j-fail', raffleId, requestId, 'failed', {
          failedReason: 'RPC timeout',
          attemptsMade: 5,
          timestamp: NOW - 3 * 60_000,
        }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 80, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('failed');
      expect(entry.queueState).toBe('failed');
      expect(entry.lastError).toBe('RPC timeout');
      expect(entry.nextStep).toContain('re-enqueue');
      expect(report.summary.failed).toBe(1);
    });

    it('surfaces lastError from health metrics when no failedReason on job', async () => {
      const raffleId = 41;
      const requestId = 'req-health-error';
      const errorMsg = 'contract invocation error';

      mockQueue.getFailed.mockResolvedValue([
        makeJob('j-hlt', raffleId, requestId, 'failed', { attemptsMade: 3 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });
      mockHealthService.getMetrics.mockReturnValue({
        recentErrors: [{ requestId, raffleId, error: errorMsg, timestamp: new Date() }],
      });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.lastError).toBe(errorMsg);
      expect(entry.signals).toContain('has_last_error');
    });

    it('does NOT re-classify a failed job as stuck when onchain status is DRAWING', async () => {
      // A failed job should stay "failed", not be promoted to "stuck"
      const raffleId = 42;
      const requestId = 'req-failed-not-stuck';
      mockQueue.getFailed.mockResolvedValue([
        makeJob('j-f2', raffleId, requestId, 'failed', { failedReason: 'timeout', attemptsMade: 5 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('failed');
      expect(entry.status).not.toBe('stuck');
    });
  });

  // ─── classification: CONFIRMED ────────────────────────────────────────────────

  describe('classification — confirmed / resolved', () => {
    it('classifies a completed job with FINALIZED contract as confirmed', async () => {
      const raffleId = 50;
      const requestId = 'req-confirmed';
      mockQueue.getCompleted.mockResolvedValue([
        makeJob('j-done', raffleId, requestId, 'completed', { timestamp: NOW - 60 * 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 200, status: 'FINALIZED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
      expect(entry.contractStatus).toBe('FINALIZED');
      expect(entry.queueState).toBe('completed');
      expect(entry.signals).toContain('contract:FINALIZED');
      expect(entry.nextStep).toContain('No action required');
      expect(report.summary.confirmed).toBe(1);
    });

    it('classifies a CANCELLED contract as confirmed regardless of queue state', async () => {
      const raffleId = 51;
      const requestId = 'req-cancelled';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 100, timestamp: new Date(NOW - 10 * 60_000) },
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 0, status: 'CANCELLED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
      expect(entry.signals).toContain('contract:CANCELLED');
    });

    it('FINALIZED contract is never classified as stuck even when lag monitor still tracks it', async () => {
      const raffleId = 52;
      const requestId = 'req-fin-but-lagging';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 300, timestamp: new Date(NOW - 30 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(300 + STUCK_LEDGER_LAG + 500);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 1000, status: 'FINALIZED' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('confirmed');
    });
  });

  // ─── classification: PENDING (healthy in-flight) ──────────────────────────────

  describe('classification — pending (draw legitimately in flight)', () => {
    it('classifies a young active job with small ledger lag as pending', async () => {
      const raffleId = 60;
      const requestId = 'req-healthy-active';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 5000, timestamp: new Date(NOW - 30_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(5020); // lag = 20, well below threshold
      mockQueue.getActive.mockResolvedValue([
        makeJob('j-ok', raffleId, requestId, 'active', { timestamp: NOW - 30_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).toBe('pending');
      expect(entry.signals).toContain('ledger_lag_healthy:20');
      expect(entry.signals.some((s) => s.startsWith('queue_age_healthy'))).toBe(true);
      expect(entry.nextStep).toContain('No action required');
      expect(report.summary.pending).toBe(1);
    });

    it('classifies a draw awaiting a slow RPC (no ledger data yet) as pending', async () => {
      // Lag monitor knows about the request but requestedAtLedger is 0 (not yet resolved)
      const raffleId = 61;
      const requestId = 'req-slow-rpc';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 0, timestamp: new Date(NOW - 45_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(0); // RPC not synced
      mockQueue.getActive.mockResolvedValue([
        makeJob('j-rpc', raffleId, requestId, 'active', { timestamp: NOW - 45_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 60, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      // lagLedgers should be 0 → not stuck
      expect(entry.ledgerRange.lagLedgers).toBe(0);
      expect(entry.status).not.toBe('stuck');
    });

    it('classifies a job that just entered the queue (waiting, very recent) as pending', async () => {
      const raffleId = 62;
      const requestId = 'req-just-queued';
      mockQueue.getWaiting.mockResolvedValue([
        makeJob('j-new', raffleId, requestId, 'waiting', { timestamp: NOW - 5_000 }), // 5 s old
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.status).not.toBe('stuck');
    });
  });

  // ─── sorting & summary ────────────────────────────────────────────────────────

  describe('sorting and summary', () => {
    it('sorts entries: stuck first, then failed, pending, confirmed', async () => {
      // Stuck
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId: 1, requestId: 'r1', requestedAtLedger: 100, timestamp: new Date(NOW - 20 * 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(100 + STUCK_LEDGER_LAG + 50);

      // Failed
      mockQueue.getFailed.mockResolvedValue([
        makeJob('jf', 2, 'r2', 'failed', { failedReason: 'err', attemptsMade: 5 }),
      ]);

      // Confirmed
      mockQueue.getCompleted.mockResolvedValue([
        makeJob('jc', 3, 'r3', 'completed'),
      ]);

      // Active / pending
      mockQueue.getActive.mockResolvedValue([
        makeJob('ja', 4, 'r4', 'active', { timestamp: NOW - 10_000 }),
      ]);

      mockContractService.getRaffleData.mockImplementation(async (id: number) => {
        const map: Record<number, string> = { 1: 'DRAWING', 2: 'DRAWING', 3: 'FINALIZED', 4: 'DRAWING' };
        return { raffleId: id, prizeAmount: 50, status: map[id] ?? 'DRAWING' };
      });

      const report = await service.getStuckDrawReport();
      const statuses = report.entries.map((e) => e.status);

      const stuckIdx = statuses.indexOf('stuck');
      const failedIdx = statuses.indexOf('failed');
      const confirmedIdx = statuses.indexOf('confirmed');
      const pendingIdx = statuses.indexOf('pending');

      expect(stuckIdx).toBeLessThan(failedIdx);
      expect(failedIdx).toBeLessThan(confirmedIdx);
      expect(pendingIdx).toBeLessThan(confirmedIdx);
    });

    it('summary counts match the actual entry statuses', async () => {
      // Confirmed
      mockQueue.getCompleted.mockResolvedValue([
        makeJob('jc1', 10, 'rc1', 'completed'),
        makeJob('jc2', 11, 'rc2', 'completed'),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ prizeAmount: 50, status: 'FINALIZED' });

      const report = await service.getStuckDrawReport();

      expect(report.summary.confirmed).toBe(2);
      expect(report.summary.total).toBe(2);
      expect(report.summary.stuck + report.summary.failed + report.summary.pending + report.summary.confirmed)
        .toBe(report.summary.total);
    });
  });

  // ─── candidate deduplication (lag + queue merge) ─────────────────────────────

  describe('candidate merging', () => {
    it('merges lag-monitor and queue data for the same requestId into one entry', async () => {
      const raffleId = 70;
      const requestId = 'req-merge';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 3000, timestamp: new Date(NOW - 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(3020);
      mockQueue.getActive.mockResolvedValue([
        makeJob('j-merge', raffleId, requestId, 'active', { timestamp: NOW - 60_000 }),
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const matching = report.entries.filter((e) => e.requestId === requestId);

      // Same raffle+request pair must only produce one entry
      expect(matching).toHaveLength(1);
      expect(matching[0].jobId).toBe('j-merge');
      expect(matching[0].ledgerRange.requestedAtLedger).toBe(3000);
    });
  });

  // ─── contract status cache ────────────────────────────────────────────────────

  describe('contract status caching', () => {
    it('fetches contract status once per raffleId even with multiple requestIds', async () => {
      const raffleId = 80;
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId: 'rA', requestedAtLedger: 0, timestamp: new Date() },
        { raffleId, requestId: 'rB', requestedAtLedger: 0, timestamp: new Date() },
      ]);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      await service.getStuckDrawReport();

      expect(mockContractService.getRaffleData).toHaveBeenCalledTimes(1);
    });

    it('continues with UNKNOWN contract status when getRaffleData throws', async () => {
      const raffleId = 81;
      const requestId = 'req-contract-err';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 0, timestamp: new Date() },
      ]);
      mockContractService.getRaffleData.mockRejectedValue(new Error('RPC down'));

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.contractStatus).toBe('UNKNOWN');
      // Should not throw — report still produced
      expect(report.entries).toHaveLength(1);
    });
  });

  // ─── ledgerRange helpers ──────────────────────────────────────────────────────

  describe('ledgerRange computation', () => {
    it('sets lagLedgers to 0 when requestedAtLedger is unknown (0)', async () => {
      const raffleId = 90;
      const requestId = 'req-no-ledger';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 0, timestamp: new Date(NOW - 60_000) },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(5000);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.ledgerRange.lagLedgers).toBe(0);
    });

    it('computes lagLedgers as currentLedger − requestedAtLedger', async () => {
      const raffleId = 91;
      const requestId = 'req-ledger-calc';
      mockLagMonitor.getPendingRequests.mockReturnValue([
        { raffleId, requestId, requestedAtLedger: 4000, timestamp: new Date() },
      ]);
      mockLagMonitor.getCurrentLedger.mockReturnValue(4075);
      mockContractService.getRaffleData.mockResolvedValue({ raffleId, prizeAmount: 50, status: 'DRAWING' });

      const report = await service.getStuckDrawReport();
      const entry = report.entries.find((e) => e.requestId === requestId)!;

      expect(entry.ledgerRange.lagLedgers).toBe(75);
      expect(entry.ledgerRange.requestedAtLedger).toBe(4000);
      expect(entry.ledgerRange.currentLedger).toBe(4075);
    });
  });
});
