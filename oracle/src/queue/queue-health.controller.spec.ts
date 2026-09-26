import { QueueHealthController } from './queue-health.controller';
import { JobStateManager } from './job-state-manager';
import { JobState } from './job-state.types';
import { OracleLoggerService } from '../logger/oracle-logger';

function job(state: JobState) {
  const now = Date.parse('2026-01-01T00:00:00Z');
  return {
    requestId: 'req-1',
    raffleId: 9,
    currentState: state,
    attemptCount: 3,
    createdAt: now,
    updatedAt: now,
    lastError: 'rpc timeout',
    txHash: 'abc',
    ledger: 10,
    transitions: [{
      fromState: JobState.SUBMITTING,
      toState: state,
      timestamp: now,
      reason: 'gave up',
      attemptNumber: 3,
    }],
  };
}

describe('QueueHealthController', () => {
  let stateManager: {
    getMetrics: jest.Mock;
    getConfig: jest.Mock;
    getActiveProcessingCount: jest.Mock;
    getJobsByState: jest.Mock;
  };
  let controller: QueueHealthController;

  beforeEach(() => {
    stateManager = {
      getMetrics: jest.fn().mockReturnValue({
        pendingCount: 1,
        failedCount: 0,
        deadLetteredCount: 0,
      }),
      getConfig: jest.fn().mockReturnValue({ maxConcurrency: 4 }),
      getActiveProcessingCount: jest.fn().mockReturnValue(1),
      getJobsByState: jest.fn().mockReturnValue([]),
    };
    controller = new QueueHealthController(
      { debug: jest.fn(), warn: jest.fn(), log: jest.fn(), error: jest.fn() } as unknown as OracleLoggerService,
      stateManager as unknown as JobStateManager,
    );
  });

  it('is healthy while the queue is processing within limits', () => {
    const health = controller.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.activeProcessing).toBe(1);
    expect(health.maxConcurrency).toBe(4);
  });

  it('is degraded when too many jobs are pending or failing', () => {
    stateManager.getMetrics.mockReturnValue({ pendingCount: 51, failedCount: 1, deadLetteredCount: 0 });
    expect(controller.getHealth().status).toBe('degraded');

    stateManager.getMetrics.mockReturnValue({ pendingCount: 1, failedCount: 6, deadLetteredCount: 0 });
    expect(controller.getHealth().status).toBe('degraded');
  });

  it('is unhealthy when a job has been dead-lettered', () => {
    stateManager.getMetrics.mockReturnValue({ pendingCount: 0, failedCount: 0, deadLetteredCount: 2 });
    const health = controller.getHealth();
    expect(health.status).toBe('unhealthy');
    expect(health.deadLetteredCount).toBe(2);
  });

  it('returns queue metrics from the state manager', () => {
    const metrics = { pendingCount: 3, failedCount: 1, deadLetteredCount: 0 };
    stateManager.getMetrics.mockReturnValue(metrics);
    expect(controller.getMetrics()).toBe(metrics);
  });

  it('lists jobs for a real state and rejects an unknown state', () => {
    stateManager.getJobsByState.mockReturnValue([job(JobState.QUEUED)]);
    const jobs = controller.getJobsByState('queued');
    expect(stateManager.getJobsByState).toHaveBeenCalledWith(JobState.QUEUED);
    expect(jobs[0]).toMatchObject({ requestId: 'req-1', currentState: JobState.QUEUED, attemptCount: 3 });

    controller.getJobsByState('DEAD_LETTERED');
    expect(stateManager.getJobsByState).toHaveBeenCalledWith(JobState.DEAD_LETTERED);

    expect(controller.getJobsByState('not-a-state')).toEqual([]);
  });

  it('returns dead-lettered jobs with their transitions for rescue', () => {
    stateManager.getJobsByState.mockReturnValue([job(JobState.DEAD_LETTERED)]);
    const jobs = controller.getDeadLetteredJobs();
    expect(jobs[0].transitions[0]).toMatchObject({ to: JobState.DEAD_LETTERED, reason: 'gave up' });
  });
});
