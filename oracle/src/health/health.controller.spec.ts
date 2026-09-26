jest.mock('../submitter/tx-submitter.service', () => ({ TxSubmitterService: class TxSubmitterService {} }));
jest.mock('../metrics/metrics.service', () => ({ MetricsService: class MetricsService {} }));
jest.mock('../multi-oracle/oracle-registry.service', () => ({ OracleRegistryService: class OracleRegistryService {} }));
jest.mock('../multi-oracle/multi-oracle-coordinator.service', () => ({ MultiOracleCoordinatorService: class MultiOracleCoordinatorService {} }));
jest.mock('./lag-monitor.service', () => ({ LagMonitorService: class LagMonitorService {} }));
jest.mock('./health.service', () => ({ HealthService: class HealthService {} }));

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

function component(status: 'healthy' | 'degraded' | 'unhealthy', message: string) {
  return { status, message, lastCheckAt: new Date() };
}

function metrics(partial: {
  circuit?: string;
  network?: { status: 'healthy' | 'degraded' | 'unhealthy'; message: string };
  queue?: { status: 'healthy' | 'degraded' | 'unhealthy'; message: string };
  keyProvider?: { status: 'healthy' | 'degraded' | 'unhealthy'; message: string };
} = {}) {
  return {
    circuit_breaker: { state: partial.circuit ?? 'CLOSED', failureCount: 0, lastFailureAt: null },
    components: {
      listener: component('healthy', 'listener up'),
      queue: component(partial.queue?.status ?? 'healthy', partial.queue?.message ?? 'queue processing'),
      keyProvider: component(partial.keyProvider?.status ?? 'healthy', partial.keyProvider?.message ?? 'key provider available'),
      randomnessProvider: component('healthy', 'randomness ready'),
      network: component(partial.network?.status ?? 'healthy', partial.network?.message ?? 'RPC reachable'),
      submitter: component('healthy', 'submitter ready'),
    },
  };
}

describe('HealthController probes', () => {
  let getMetrics: jest.Mock;
  let controller: HealthController;

  beforeEach(() => {
    getMetrics = jest.fn().mockReturnValue(metrics());
    controller = new HealthController(
      { getMetrics } as unknown as HealthService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  function readiness() {
    const res = { status: jest.fn() };
    const body = controller.getReadiness(res as any);
    return { res, body };
  }

  it('reports each dependency when the oracle is ready to serve', () => {
    const { res, body } = readiness();

    expect(res.status).not.toHaveBeenCalled();
    expect(body.status).toBe('healthy');
    expect(body.degraded).toEqual([]);
    expect(body.dependencies.rpc).toMatchObject({ status: 'healthy', message: 'RPC reachable' });
    expect(body.dependencies.redis).toMatchObject({ status: 'healthy', message: 'queue processing' });
    expect(body.dependencies.keyProvider).toMatchObject({ status: 'healthy', message: 'key provider available' });
    expect(body.dependencies.queue).toMatchObject({ status: 'healthy', message: 'queue processing' });
  });

  it('fails readiness when the RPC circuit breaker is open and leaves liveness up', () => {
    getMetrics.mockReturnValue(metrics({ circuit: 'OPEN' }));

    const live = controller.getLiveness();
    const { res, body } = readiness();

    expect(live.status).toBe('alive');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(body.status).toBe('unhealthy');
    expect(body.degraded).toContain('rpc');
    expect(body.dependencies.rpc.message).toBe('RPC circuit breaker is open');
  });

  it('names an unreachable key provider and does not restart via liveness', () => {
    getMetrics.mockReturnValue(metrics({
      keyProvider: { status: 'unhealthy', message: 'Key provider unavailable' },
    }));

    expect(controller.getLiveness().status).toBe('alive');
    const { res, body } = readiness();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(body.degraded).toEqual(['keyProvider']);
    expect(body.dependencies.keyProvider.message).toBe('Key provider unavailable');
  });

  it('fails readiness when redis-backed queue processing is degraded and names it', () => {
    getMetrics.mockReturnValue(metrics({
      queue: { status: 'degraded', message: 'Redis reachable but queue depth elevated: 25 items' },
    }));

    const { res, body } = readiness();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(body.status).toBe('degraded');
    expect(body.degraded).toEqual(expect.arrayContaining(['redis', 'queue']));
    expect(body.dependencies.queue.message).toContain('queue depth elevated');
  });

  it('keeps liveness alive even if dependency checks throw', () => {
    getMetrics.mockImplementation(() => {
      throw new Error('redis down');
    });

    expect(controller.getLiveness()).toMatchObject({ status: 'alive' });
    expect(getMetrics).not.toHaveBeenCalled();
  });
});
