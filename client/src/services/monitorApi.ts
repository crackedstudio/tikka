/**
 * Monitor API Service
 *
 * Endpoint-at-a-glance metrics for the queue (stats, jobs, latency, errors).
 * Calls go through `apiRequest` so failures surface as typed `ApiError`
 * instances; admin endpoints use a static `X-Admin-Token` in the request
 * headers instead of a JWT, and toasts are suppressed with `silentErrors`.
 */

// Inline type definitions mirroring backend/src/api/rest/monitor/monitor.types.ts
export type JobStatus = 'pending' | 'completed' | 'failed';

export interface OracleJob {
  id: string;
  status: JobStatus;
  enqueuedAt: string;
  updatedAt: string;
  confirmedAt?: string;
  latencyMs?: number;
  xdr?: string;
  errorMessage?: string;
}

export interface PaginatedJobsResponse {
  data: OracleJob[];
  total: number;
  nextCursor: string | null;
}

export interface QueueStatsResponse {
  pending: number;
  completed: number;
  failed: number;
  timestamp: string;
}

export interface LatencyPoint {
  jobId: string;
  enqueuedAt: string;
  confirmedAt: string;
  latencyMs: number;
}

export interface ErrorRecord {
  jobId: string;
  failedAt: string;
  errorMessage: string;
  xdr: string;
}

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

function adminHeaders(): Record<string, string> {
  return ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {};
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

export async function fetchStats(): Promise<QueueStatsResponse> {
  return api.get<QueueStatsResponse>('/monitor/stats', {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

export async function fetchJobs(params?: {
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedJobsResponse> {
  return api.get<PaginatedJobsResponse>(`/monitor/jobs${buildQuery(params)}`, {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

export async function fetchLatency(params?: {
  from?: string;
  to?: string;
}): Promise<LatencyPoint[]> {
  return api.get<LatencyPoint[]>(`/monitor/latency${buildQuery(params)}`, {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

export async function fetchErrors(params?: {
  limit?: number;
}): Promise<ErrorRecord[]> {
  return api.get<ErrorRecord[]>(`/monitor/errors${buildQuery(params)}`, {
    headers: adminHeaders(),
    silentErrors: true,
  });
}
