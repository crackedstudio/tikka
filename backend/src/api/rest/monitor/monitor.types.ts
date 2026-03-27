export type JobStatus = 'pending' | 'completed' | 'failed';

export interface OracleJob {
  id: string;
  status: JobStatus;
  enqueuedAt: string;   // ISO 8601
  updatedAt: string;    // ISO 8601
  confirmedAt?: string; // ISO 8601
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
  timestamp: string; // ISO 8601
}

export interface LatencyPoint {
  jobId: string;
  enqueuedAt: string;  // ISO 8601
  confirmedAt: string; // ISO 8601
  latencyMs: number;
}

export interface ErrorRecord {
  jobId: string;
  failedAt: string;
  errorMessage: string;
  xdr: string;
}
