import { describe, test, expect } from 'vitest';
import { transformMonitorData, RawMonitorResponse } from './adapters';

describe('Monitor Data Adapters', () => {
  test('should handle completely empty or partial data responses safely', () => {
    const emptyPayload: Partial<RawMonitorResponse> = {};
    const model = transformMonitorData(emptyPayload);

    expect(model.health.status).toBe('critical');
    expect(model.health.formattedUptime).toBe('0m');
    expect(model.performance.isSlow).toBe(false);
    expect(model.queue.hasFailures).toBe(false);
    expect(model.alerts.length).toBe(0);
  });

  test('should transform functional data and format severities correctly', () => {
    const activePayload: Partial<RawMonitorResponse> = {
      health: { status: 'WARN', uptime: 7200 },
      latency: { averageMs: 45, p99Ms: 600 },
      jobs: { active: 5, failed: 2, queueDepth: 12 },
      errors: [
        { timestamp: '2026-06-02T06:00:00.000Z', message: 'Database pool exhaustion', level: 'error' }
      ]
    };

    const model = transformMonitorData(activePayload);

    expect(model.health.status).toBe('degraded');
    expect(model.health.formattedUptime).toBe('2.0h');
    expect(model.performance.p99Latency).toBe('600ms');
    expect(model.performance.isSlow).toBe(true);
    expect(model.queue.hasFailures).toBe(true);
    expect(model.alerts[0].badgeColor).toBe('red');
  });
});
