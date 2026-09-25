import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchRandomnessJobs,
  fetchOracleStatus,
  reEnqueueJob,
  forceSubmitRandomness,
  forceFailJob,
} from './oracleApi';

describe('oracleApi service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('includes X-Admin-Token header from sessionStorage in API requests', async () => {
    sessionStorage.setItem('admin_token', 'test-token-123');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ waiting: [], active: [], failed: [] }),
    });
    global.fetch = mockFetch;

    await fetchRandomnessJobs();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toEqual({ 'X-Admin-Token': 'test-token-123' });
  });

  it('throws an error when API returns 401 Unauthorized (non-admin token)', async () => {
    sessionStorage.setItem('admin_token', 'invalid-user-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(fetchRandomnessJobs()).rejects.toThrow(
      'Oracle API error 401: Unauthorized',
    );
  });

  it('sends correct body and headers for reEnqueueJob', async () => {
    sessionStorage.setItem('admin_token', 'admin-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Re-enqueued' }),
    });
    global.fetch = mockFetch;

    const result = await reEnqueueJob('job-1', 'Operator A', 'Retry reason');

    expect(result).toEqual({ success: true, message: 'Re-enqueued' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/rescue/re-enqueue');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      jobId: 'job-1',
      operator: 'Operator A',
      reason: 'Retry reason',
    });
  });

  it('sends correct body and headers for forceSubmitRandomness', async () => {
    sessionStorage.setItem('admin_token', 'admin-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Submitted' }),
    });
    global.fetch = mockFetch;

    const result = await forceSubmitRandomness(10, 'req-abc', 'Operator B', 'Manual submit');

    expect(result).toEqual({ success: true, message: 'Submitted' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/rescue/force-submit');
    expect(JSON.parse(init.body)).toEqual({
      raffleId: 10,
      requestId: 'req-abc',
      operator: 'Operator B',
      reason: 'Manual submit',
    });
  });

  it('sends correct body and headers for forceFailJob', async () => {
    sessionStorage.setItem('admin_token', 'admin-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Failed' }),
    });
    global.fetch = mockFetch;

    const result = await forceFailJob('job-2', 'Operator C', 'Manual fail');

    expect(result).toEqual({ success: true, message: 'Failed' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/rescue/force-fail');
    expect(JSON.parse(init.body)).toEqual({
      jobId: 'job-2',
      operator: 'Operator C',
      reason: 'Manual fail',
    });
  });
});
