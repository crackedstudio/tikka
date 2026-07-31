import { MetricsService, OracleHeartbeatComponent } from './metrics.service';

const COMPONENTS: OracleHeartbeatComponent[] = ['listener', 'queue', 'submitter'];

describe('MetricsService component heartbeats', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('records independent last-activity timestamps per component', () => {
    const t0 = 1_700_000_000_000;
    metrics.recordComponentHeartbeat('listener', t0);
    metrics.recordComponentHeartbeat('queue', t0 + 100);
    metrics.recordComponentHeartbeat('submitter', t0 + 200);

    expect(metrics.getComponentHeartbeatMs('listener')).toBe(t0);
    expect(metrics.getComponentHeartbeatMs('queue')).toBe(t0 + 100);
    expect(metrics.getComponentHeartbeatMs('submitter')).toBe(t0 + 200);
  });

  it('exports heartbeat gauges in Prometheus text', async () => {
    metrics.recordComponentHeartbeat('listener', 1_700_000_000_000);
    const text = await metrics.getMetrics();
    expect(text).toContain('tikka_oracle_component_heartbeat_unixtime');
    expect(text).toContain('component="listener"');
  });

  it('freezing one component makes its heartbeat go stale while others keep updating', async () => {
    const base = Date.now();
    for (const component of COMPONENTS) {
      metrics.recordComponentHeartbeat(component, base);
    }

    const frozenListener = metrics.getComponentHeartbeatMs('listener');

    await new Promise((resolve) => setTimeout(resolve, 30));

    const later = Date.now();
    // Simulate a wedged listener: only queue + submitter keep looping.
    metrics.recordComponentHeartbeat('queue', later);
    metrics.recordComponentHeartbeat('submitter', later);

    expect(metrics.getComponentHeartbeatMs('listener')).toBe(frozenListener);
    expect(metrics.getComponentHeartbeatMs('queue')).toBeGreaterThan(frozenListener);
    expect(metrics.getComponentHeartbeatMs('submitter')).toBeGreaterThan(
      frozenListener,
    );

    const ageMs = Date.now() - metrics.getComponentHeartbeatMs('listener');
    expect(ageMs).toBeGreaterThanOrEqual(30);
  });
});
