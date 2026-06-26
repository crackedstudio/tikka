export interface RawMonitorResponse {
  health: { status: string; uptime: number };
  latency: { averageMs: number; p99Ms: number };
  jobs: { active: number; failed: number; queueDepth: number };
  errors: Array<{ timestamp: string; message: string; level: 'info' | 'warn' | 'error' }>;
  auditLog: Array<{ id: string; action: string; time: string; actor: string }>;
}

export interface MonitorViewModel {
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    formattedUptime: string;
  };
  performance: {
    avgLatency: string;
    p99Latency: string;
    isSlow: boolean;
  };
  queue: {
    summary: string;
    hasFailures: boolean;
  };
  alerts: Array<{
    id: number;
    time: string;
    text: string;
    badgeColor: string;
  }>;
}

export function transformMonitorData(raw: Partial<RawMonitorResponse>): MonitorViewModel {
  // 1. Health Status Mapping
  const rawStatus = raw.health?.status?.toLowerCase() || 'unknown';
  let cleanStatus: 'healthy' | 'degraded' | 'critical' = 'critical';
  if (rawStatus === 'ok' || rawStatus === 'healthy') cleanStatus = 'healthy';
  else if (rawStatus === 'warn' || rawStatus === 'degraded') cleanStatus = 'degraded';

  const uptimeSec = raw.health?.uptime || 0;
  const formattedUptime = uptimeSec > 3600 
    ? `${(uptimeSec / 3600).toFixed(1)}h` 
    : `${Math.floor(uptimeSec / 60)}m`;

  // 2. Latency Formatting
  const avg = raw.latency?.averageMs || 0;
  const p99 = raw.latency?.p99Ms || 0;

  // 3. Queue Management
  const activeJobs = raw.jobs?.active || 0;
  const failedJobs = raw.jobs?.failed || 0;

  // 4. Alerts and Severity Decorators
  const alerts = (raw.errors || []).map((err, idx) => {
    let color = 'gray';
    if (err.level === 'error') color = 'red';
    if (err.level === 'warn') color = 'yellow';

    return {
      id: idx,
      time: err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : 'Unknown',
      text: err.message || 'Unknown system event',
      badgeColor: color,
    };
  });

  return {
    health: {
      status: cleanStatus,
      formattedUptime,
    },
    performance: {
      avgLatency: `${avg}ms`,
      p99Latency: `${p99}ms`,
      isSlow: p99 > 500,
    },
    queue: {
      summary: `${activeJobs} active / ${raw.jobs?.queueDepth || 0} queued`,
      hasFailures: failedJobs > 0,
    },
    alerts,
  };
}
