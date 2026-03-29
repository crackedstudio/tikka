import { useState, useEffect } from 'react';
import {
  fetchStats,
  fetchLatency,
  fetchErrors,
  QueueStatsResponse,
  LatencyPoint,
  ErrorRecord,
} from '../services/monitorApi';

interface UseMonitorOptions {
  refreshInterval?: number;
  from?: string;
  to?: string;
}

interface UseMonitorResult {
  stats: QueueStatsResponse | null;
  latencyData: LatencyPoint[];
  errors: ErrorRecord[];
  loading: boolean;
  error: string | null;
}

export function useMonitor({
  refreshInterval = 30000,
  from,
  to,
}: UseMonitorOptions = {}): UseMonitorResult {
  const [stats, setStats] = useState<QueueStatsResponse | null>(null);
  const [latencyData, setLatencyData] = useState<LatencyPoint[]>([]);
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll stats on interval
  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const data = await fetchStats();
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    loadStats();
    const id = setInterval(loadStats, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshInterval]);

  // Fetch latency on mount and when from/to change
  useEffect(() => {
    let cancelled = false;

    async function loadLatency() {
      try {
        const data = await fetchLatency({ from, to });
        if (!cancelled) setLatencyData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    loadLatency();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  // Fetch errors on mount only
  useEffect(() => {
    let cancelled = false;

    async function loadErrors() {
      try {
        const data = await fetchErrors();
        if (!cancelled) setErrors(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    loadErrors();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, latencyData, errors, loading, error };
}
