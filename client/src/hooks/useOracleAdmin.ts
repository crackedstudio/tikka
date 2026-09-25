import { useState, useEffect, useCallback } from 'react';
import {
  fetchRandomnessJobs,
  fetchOracleStatus,
  reEnqueueJob,
  forceSubmitRandomness,
  forceFailJob,
  type JobsByState,
  type OracleStatus,
  type RescueResponse,
} from '../services/oracleApi';

export function useOracleAdmin() {
  const [jobs, setJobs] = useState<JobsByState | null>(null);
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const token = sessionStorage.getItem('admin_token');
    return !!token && token.trim().length > 0;
  }, []);

  const loadData = useCallback(async () => {
    if (!isAdmin()) {
      setError('Admin session required');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const [jobsData, statusData] = await Promise.all([
        fetchRandomnessJobs(),
        fetchOracleStatus(),
      ]);
      setJobs(jobsData);
      setOracleStatus(statusData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load oracle data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const reEnqueue = useCallback(
    async (jobId: string, operator: string, reason: string): Promise<RescueResponse> => {
      if (!isAdmin()) {
        throw new Error('Unauthorized: Admin session required for privileged actions');
      }
      const res = await reEnqueueJob(jobId, operator, reason);
      await loadData();
      return res;
    },
    [isAdmin, loadData],
  );

  const forceSubmit = useCallback(
    async (
      raffleId: number,
      requestId: string,
      operator: string,
      reason: string,
    ): Promise<RescueResponse> => {
      if (!isAdmin()) {
        throw new Error('Unauthorized: Admin session required for privileged actions');
      }
      const res = await forceSubmitRandomness(raffleId, requestId, operator, reason);
      await loadData();
      return res;
    },
    [isAdmin, loadData],
  );

  const forceFail = useCallback(
    async (jobId: string, operator: string, reason: string): Promise<RescueResponse> => {
      if (!isAdmin()) {
        throw new Error('Unauthorized: Admin session required for privileged actions');
      }
      const res = await forceFailJob(jobId, operator, reason);
      await loadData();
      return res;
    },
    [isAdmin, loadData],
  );

  return {
    jobs,
    oracleStatus,
    loading,
    error,
    loadData,
    reEnqueue,
    forceSubmit,
    forceFail,
    isAdmin: isAdmin(),
  };
}
