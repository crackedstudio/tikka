import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOracleAdmin } from './useOracleAdmin';
import * as oracleApi from '../services/oracleApi';

vi.mock('../services/oracleApi', () => ({
  fetchRandomnessJobs: vi.fn(),
  fetchOracleStatus: vi.fn(),
  reEnqueueJob: vi.fn(),
  forceSubmitRandomness: vi.fn(),
  forceFailJob: vi.fn(),
}));

describe('useOracleAdmin hook', () => {
  const mockJobs = {
    waiting: [],
    active: [{ id: 'job-1', raffleId: 10, requestId: 'req-10', state: 'active' as const, timestamp: 1000, attempts: 1 }],
    failed: [{ id: 'job-2', raffleId: 11, requestId: 'req-11', state: 'failed' as const, timestamp: 2000, attempts: 3 }],
  };

  const mockStatus = {
    status: 'healthy' as const,
    components: [],
    circuitState: 'closed' as const,
    metrics: { totalProcessed: 100, totalFailed: 2, successRate: '98%' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(oracleApi.fetchRandomnessJobs).mockResolvedValue(mockJobs);
    vi.mocked(oracleApi.fetchOracleStatus).mockResolvedValue(mockStatus);
  });

  it('indicates non-admin when sessionStorage has no admin token and refuses data fetch', async () => {
    const { result } = renderHook(() => useOracleAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.error).toBe('Admin session required');
    expect(oracleApi.fetchRandomnessJobs).not.toHaveBeenCalled();
  });

  it('fetches data when session is admin', async () => {
    sessionStorage.setItem('admin_token', 'valid-token');

    const { result } = renderHook(() => useOracleAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.jobs).toEqual(mockJobs);
    expect(result.current.oracleStatus).toEqual(mockStatus);
    expect(result.current.error).toBeNull();
  });

  it('refuses privileged call (reEnqueue) when session is not admin', async () => {
    const { result } = renderHook(() => useOracleAdmin());

    await expect(
      result.current.reEnqueue('job-2', 'Operator', 'Fixing job'),
    ).rejects.toThrow('Unauthorized: Admin session required for privileged actions');

    expect(oracleApi.reEnqueueJob).not.toHaveBeenCalled();
  });

  it('executes reEnqueue when session is admin', async () => {
    sessionStorage.setItem('admin_token', 'valid-token');
    vi.mocked(oracleApi.reEnqueueJob).mockResolvedValue({ success: true, message: 'Re-enqueued' });

    const { result } = renderHook(() => useOracleAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.reEnqueue('job-2', 'Operator', 'Reason');
    });

    expect(res).toEqual({ success: true, message: 'Re-enqueued' });
    expect(oracleApi.reEnqueueJob).toHaveBeenCalledWith('job-2', 'Operator', 'Reason');
  });

  it('refuses privileged call (forceSubmit) when session is not admin', async () => {
    const { result } = renderHook(() => useOracleAdmin());

    await expect(
      result.current.forceSubmit(10, 'req-10', 'Operator', 'Force submitting'),
    ).rejects.toThrow('Unauthorized: Admin session required for privileged actions');

    expect(oracleApi.forceSubmitRandomness).not.toHaveBeenCalled();
  });

  it('executes forceSubmit when session is admin', async () => {
    sessionStorage.setItem('admin_token', 'valid-token');
    vi.mocked(oracleApi.forceSubmitRandomness).mockResolvedValue({ success: true, message: 'Submitted' });

    const { result } = renderHook(() => useOracleAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.forceSubmit(10, 'req-10', 'Operator', 'Manual submission');
    });

    expect(res).toEqual({ success: true, message: 'Submitted' });
    expect(oracleApi.forceSubmitRandomness).toHaveBeenCalledWith(10, 'req-10', 'Operator', 'Manual submission');
  });

  it('refuses privileged call (forceFail) when session is not admin', async () => {
    const { result } = renderHook(() => useOracleAdmin());

    await expect(
      result.current.forceFail('job-1', 'Operator', 'Failing job'),
    ).rejects.toThrow('Unauthorized: Admin session required for privileged actions');

    expect(oracleApi.forceFailJob).not.toHaveBeenCalled();
  });
});
