import type {
  JobStatus,
  OracleJob,
  PaginatedJobsResponse,
  QueueStatsResponse,
  LatencyPoint,
  ErrorRecord,
  MonitorJobsParams,
  MonitorLatencyParams,
  MonitorErrorsParams,
} from "../types/api-types";

export type {
  JobStatus,
  OracleJob,
  PaginatedJobsResponse,
  QueueStatsResponse,
  LatencyPoint,
  ErrorRecord,
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string;

function adminHeaders(): HeadersInit {
  return { 'X-Admin-Token': ADMIN_TOKEN };
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { headers: adminHeaders() });
  if (!res.ok) {
    throw new Error(`Monitor API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchStats(): Promise<QueueStatsResponse> {
  return get<QueueStatsResponse>('/monitor/stats');
}

export async function fetchJobs(params?: MonitorJobsParams): Promise<PaginatedJobsResponse> {
  const query: Record<string, string> = {};
  if (params?.status !== undefined) query.status = params.status;
  if (params?.limit !== undefined) query.limit = String(params.limit);
  if (params?.cursor !== undefined) query.cursor = params.cursor;
  return get<PaginatedJobsResponse>('/monitor/jobs', query);
}

export async function fetchLatency(params?: MonitorLatencyParams): Promise<LatencyPoint[]> {
  const query: Record<string, string> = {};
  if (params?.from !== undefined) query.from = params.from;
  if (params?.to !== undefined) query.to = params.to;
  return get<LatencyPoint[]>('/monitor/latency', query);
}

export async function fetchErrors(params?: MonitorErrorsParams): Promise<ErrorRecord[]> {
  const query: Record<string, string> = {};
  if (params?.limit !== undefined) query.limit = String(params.limit);
  return get<ErrorRecord[]>('/monitor/errors', query);
}
