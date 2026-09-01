/**
 * API Types
 *
 * Single source of truth for all backend API types used by the client.
 *
 * Query/path parameter types are derived from the generated OpenAPI schema in
 * api.generated.ts (run `pnpm generate:types` to regenerate from
 * backend/openapi.json).  Response body shapes are authored here because the
 * backend controllers do not yet carry @ApiOkResponse schema decorators; once
 * they do, these can be replaced with generated counterparts too.
 */

import type { operations } from "./api.generated";

// ─── Re-export generated operation types for convenience ─────────────────────

export type { paths, operations, components } from "./api.generated";

// ─── Query parameter types (derived from generated spec) ─────────────────────

/** Query params accepted by GET /raffles */
export type RaffleListParams = NonNullable<
  operations["RafflesController_list"]["parameters"]["query"]
>;

/** Alias kept for backwards compat with existing service call-sites */
export type RaffleListFilters = RaffleListParams;

/** Query params accepted by GET /users/:address/history */
export type UserHistoryParams = NonNullable<
  operations["UsersController_getHistory"]["parameters"]["query"]
>;

/** Query params accepted by GET /leaderboard */
export type LeaderboardParams = NonNullable<
  operations["LeaderboardController_getLeaderboard"]["parameters"]["query"]
>;

/** Derived leaderboard sort field from the spec */
export type LeaderboardSortBy = NonNullable<LeaderboardParams["by"]>;

/** Query params accepted by GET /search */
export type SearchParams = NonNullable<
  operations["SearchController_search"]["parameters"]["query"]
>;

/** Sort options for search, derived from spec */
export type SearchSortBy = NonNullable<SearchParams["sort"]>;

/** Query params accepted by GET /monitor/jobs */
export type MonitorJobsParams = NonNullable<
  operations["MonitorController_getJobs"]["parameters"]["query"]
>;

/** Job status values for monitor, derived from spec */
export type MonitorJobStatus = NonNullable<MonitorJobsParams["status"]>;

/** Query params accepted by GET /monitor/latency */
export type MonitorLatencyParams = NonNullable<
  operations["MonitorController_getLatency"]["parameters"]["query"]
>;

/** Query params accepted by GET /monitor/errors */
export type MonitorErrorsParams = NonNullable<
  operations["MonitorController_getErrors"]["parameters"]["query"]
>;

// ─── Request body types ───────────────────────────────────────────────────────
// The SupportController requestBody is not annotated in the spec, so this is
// authored manually mirroring backend/src/api/rest/support/dto/create-ticket.dto.ts

/** Body for POST /support */
export interface SupportTicketDTO {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// ─── Response body types ──────────────────────────────────────────────────────
// The backend controllers currently omit @ApiOkResponse schema decorators so
// the generated spec has `content?: never` for these endpoints.  These types
// mirror the actual runtime responses and must be kept in sync with the backend
// models.  Add a comment referencing the backend file for each group.

// ── /raffles ─────────────────────────────────────────────────────────────────
// backend/src/api/rest/raffles/dto/raffle.dto.ts (and indexer row shape)

/** A raffle entry as returned in the list endpoint GET /raffles */
export interface ApiRaffleListItem {
  id: number;
  creator: string;
  status: string;
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  created_ledger: number;
  finalized_ledger: number | null;
  metadata_cid: string | null;
  created_at: string;
  participant_count?: number;
}

/** Response envelope for GET /raffles */
export interface ApiRaffleListResponse {
  raffles: ApiRaffleListItem[];
  total?: number;
}

/**
 * Extended raffle detail from GET /raffles/:id.
 * Merges indexer contract data with off-chain metadata fields.
 */
export interface ApiRaffleDetail extends ApiRaffleListItem {
  title?: string;
  description?: string;
  image_url?: string | null;
  category?: string | null;
  winnings_withdrawn?: boolean | null;
  /** @deprecated use winnings_withdrawn */
  winningsWithdrawn?: boolean | null;
  prize_claimed?: boolean | null;
  /** @deprecated use prize_claimed */
  prizeClaimed?: boolean | null;
}

// ── /users ───────────────────────────────────────────────────────────────────
// backend/src/api/rest/users/dto/user.dto.ts

/** User profile from GET /users/:address */
export interface ApiUserProfile {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  first_seen_ledger: number;
  updated_at: string;
  creator_stats?: {
    raffles_created: number;
    total_tickets_sold: number;
    total_xlm_raised: string;
    participant_win_rate: number;
  };
}

/** A single participation record from GET /users/:address/history */
export interface ApiUserHistoryItem {
  raffle_id: number;
  status: string;
  tickets_bought: number;
  purchased_at_ledger: number;
  purchase_tx_hash: string;
  prize_amount: string | null;
  is_winner: boolean;
}

/** Response envelope for GET /users/:address/history */
export interface ApiUserHistoryResponse {
  items: ApiUserHistoryItem[];
  total: number;
}

// ── /leaderboard ─────────────────────────────────────────────────────────────
// backend/src/api/rest/leaderboard/dto/leaderboard.dto.ts

/** A single leaderboard row from GET /leaderboard */
export interface LeaderboardEntry {
  address: string;
  total_tickets?: number;
  total_wins?: number;
  total_volume_xlm?: string;
  rank?: number;
}

/** Response envelope for GET /leaderboard */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

// ── /monitor ──────────────────────────────────────────────────────────────────
// backend/src/api/rest/monitor/monitor.types.ts

/** Status values for oracle jobs (monitor) */
export type JobStatus = "pending" | "completed" | "failed";

/** A single oracle job record from GET /monitor/jobs */
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

/** Response from GET /monitor/jobs */
export interface PaginatedJobsResponse {
  data: OracleJob[];
  total: number;
  nextCursor: string | null;
}

/** Response from GET /monitor/stats */
export interface QueueStatsResponse {
  pending: number;
  completed: number;
  failed: number;
  timestamp: string;
}

/** A single latency data point from GET /monitor/latency */
export interface LatencyPoint {
  jobId: string;
  enqueuedAt: string;
  confirmedAt: string;
  latencyMs: number;
}

/** A single error record from GET /monitor/errors */
export interface ErrorRecord {
  jobId: string;
  failedAt: string;
  errorMessage: string;
  xdr: string;
}

// ── /oracle (rescue) ──────────────────────────────────────────────────────────
// backend/src/oracle/rescue/rescue.types.ts

/** State values for BullMQ randomness jobs */
export type JobState = "waiting" | "active" | "completed" | "failed" | "delayed";

/** A randomness job record from GET /rescue/jobs */
export interface RandomnessJobInfo {
  id: string;
  raffleId: number;
  requestId: string;
  attempts: number;
  state: JobState;
  timestamp: number;
  failedReason?: string;
}

/** Response from GET /rescue/jobs, grouped by state */
export interface JobsByState {
  waiting: RandomnessJobInfo[];
  active: RandomnessJobInfo[];
  completed: RandomnessJobInfo[];
  failed: RandomnessJobInfo[];
  delayed: RandomnessJobInfo[];
}

/** A single stuck draw entry from GET /rescue/stuck-draws */
export interface StuckDrawEntry {
  raffleId: number;
  requestId: string;
  jobId: string;
  status: "stuck" | "pending" | "confirmed" | "failed";
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

/** Response from GET /rescue/stuck-draws */
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

/** Component health status */
export type ComponentStatus = "healthy" | "degraded" | "unhealthy";

/** Oracle health from GET /oracle/status */
export interface OracleStatus {
  status: "healthy" | "degraded" | "unhealthy";
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
  circuitState?: "closed" | "open" | "half-open";
}

/** Response from POST /rescue/* operations */
export interface RescueResponse {
  success: boolean;
  message: string;
  newJobId?: string;
  txHash?: string;
}

// ─── UI / presentation types (client-only, not from backend) ─────────────────

/** Formatted raffle object used by UI components */
export interface FormattedRaffle {
  id: number;
  creator: string;
  title?: string;
  status: string;
  description: string;
  endTime: number;
  maxTickets: number;
  allowMultipleTickets: boolean;
  ticketPrice: string;
  ticketToken: string | undefined;
  totalTicketsSold: number;
  winner: string | null;
  winningTicketId: number;
  isActive: boolean;
  isFinalized: boolean;
  winningsWithdrawn: boolean;
  countdown: {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  };
  progress: number;
  entries: number;
  ticketPriceFormatted: string;
  prizeValue: string;
  prizeCurrency: string;
  buttonText: string;
  image: string;
  metadata: {
    title: string;
    description: string;
    image: string;
    images?: string[];
    prizeName: string;
    prizeValue: string;
    prizeCurrency: string;
    category: string;
    tags: string[];
    createdBy: string;
    createdAt: number;
    updatedAt: number;
  };
}
