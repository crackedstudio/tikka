/**
 * Oracle API Service
 *
 * Handles oracle-specific operations including randomness jobs, rescue
 * operations, and oracle health. Calls go through `apiRequest` so failures
 * surface as typed `ApiError` instances; admin endpoints use a static
 * `X-Admin-Token` in the request headers instead of a JWT.
 *
 * Toasts and the session-expired callback are suppressed (`silentErrors`) so
 * a 401 here (which means bad admin token, not an expired user session)
 * does not log the user out.
 */

import { api } from './apiClient';

export interface RandomnessJobInfo {
  id: string;
  raffleId: number;
  requestId: string;
  attempts: number;
  state: JobState;
  timestamp: number;
  failedReason?: string;
}

export type JobState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobsByState {
  waiting: RandomnessJobInfo[];
  active: RandomnessJobInfo[];
  completed: RandomnessJobInfo[];
  failed: RandomnessJobInfo[];
  delayed: RandomnessJobInfo[];
}

export interface StuckDrawEntry {
  raffleId: number;
  requestId: string;
  jobId: string;
  status: 'stuck' | 'pending' | 'confirmed' | 'failed';
  ageMs: number;
  since: string;
  contractStatus: string;
  queueState: string;
  ledgerRange: {
    requestedAtLedger: number;
    currentLedger: number;
    lagLedgers: number;
  };
  lastError?: string;
  nextStep: string;
  signals: string[];
}

export interface StuckDrawReport {
  timestamp: string;
  currentLedger: number;
  entries: StuckDrawEntry[];
  summary: {
    stuck: number;
    pending: number;
    confirmed: number;
    failed: number;
    total: number;
  };
}

export interface OracleStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  metrics: {
    queueDepth: number;
    lastProcessedAt: string;
    lastProcessedRequestId: string;
    totalProcessed: number;
    totalFailed: number;
    successRate: string;
  };
  components: Record<string, { status: ComponentStatus; message: string }>;
  circuitState?: 'closed' | 'open' | 'half-open';
}

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RescueResponse {
  success: boolean;
  message: string;
  newJobId?: string;
  txHash?: string;
}

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

/**
 * Custom headers for admin endpoints. The X-Admin-Token replaces the usual
 * bearer JWT — these endpoints are gated by token, not by user session.
 */
function adminHeaders(): Record<string, string> {
  return ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {};
}

/**
 * Build a query string from optional params, merging with any keys the caller
 * supplies. Empty objects (undefined fields) are skipped.
 */
function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

/**
 * Fetch all randomness jobs organized by state
 */
export async function fetchRandomnessJobs(): Promise<JobsByState> {
  return api.get<JobsByState>('/rescue/jobs', {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

/**
 * Fetch stuck draw detection report
 */
export async function fetchStuckDrawReport(): Promise<StuckDrawReport> {
  return api.get<StuckDrawReport>('/rescue/stuck-draws', {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

/**
 * Fetch oracle status including circuit breaker state
 */
export async function fetchOracleStatus(): Promise<OracleStatus> {
  return api.get<OracleStatus>('/oracle/status', {
    headers: adminHeaders(),
    silentErrors: true,
  });
}

/**
 * Re-enqueue a failed job
 */
export async function reEnqueueJob(
  jobId: string,
  operator: string,
  reason: string,
): Promise<RescueResponse> {
  return api.post<RescueResponse>(
    '/rescue/re-enqueue',
    { jobId, operator, reason },
    {
      headers: adminHeaders(),
      silentErrors: true,
    },
  );
}

/**
 * Force submit randomness for a raffle
 */
export async function forceSubmitRandomness(
  raffleId: number,
  requestId: string,
  operator: string,
  reason: string,
  prizeAmount?: number,
): Promise<RescueResponse> {
  return api.post<RescueResponse>(
    '/rescue/force-submit',
    { raffleId, requestId, operator, reason, prizeAmount },
    {
      headers: adminHeaders(),
      silentErrors: true,
    },
  );
}

/**
 * Force fail a job
 */
export async function forceFailJob(
  jobId: string,
  operator: string,
  reason: string,
): Promise<RescueResponse> {
  return api.post<RescueResponse>(
    '/rescue/force-fail',
    { jobId, operator, reason },
    {
      headers: adminHeaders(),
      silentErrors: true,
    },
  );
}
