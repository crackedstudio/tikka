/**
 * Oracle API Service
 * Handles oracle-specific operations including randomness jobs and rescue operations
 */

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
    throw new Error(`Oracle API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: Record<string, any>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Oracle API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch all randomness jobs organized by state
 */
export async function fetchRandomnessJobs(): Promise<JobsByState> {
  return get<JobsByState>('/rescue/jobs');
}

/**
 * Fetch stuck draw detection report
 */
export async function fetchStuckDrawReport(): Promise<StuckDrawReport> {
  return get<StuckDrawReport>('/rescue/stuck-draws');
}

/**
 * Fetch oracle status including circuit breaker state
 */
export async function fetchOracleStatus(): Promise<OracleStatus> {
  return get<OracleStatus>('/oracle/status');
}

/**
 * Re-enqueue a failed job
 */
export async function reEnqueueJob(
  jobId: string,
  operator: string,
  reason: string,
): Promise<RescueResponse> {
  return post<RescueResponse>('/rescue/re-enqueue', {
    jobId,
    operator,
    reason,
  });
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
  return post<RescueResponse>('/rescue/force-submit', {
    raffleId,
    requestId,
    operator,
    reason,
    prizeAmount,
  });
}

/**
 * Force fail a job
 */
export async function forceFailJob(
  jobId: string,
  operator: string,
  reason: string,
): Promise<RescueResponse> {
  return post<RescueResponse>('/rescue/force-fail', {
    jobId,
    operator,
    reason,
  });
}
