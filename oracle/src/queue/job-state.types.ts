/**
 * Explicit job state machine for randomness request lifecycle tracking.
 * 
 * State Transition Flow:
 * queued → generating → submitting → confirming → confirmed ✓
 *    ↓         ↓            ↓            ↓
 *    └─────────┴────────────┴────────────→ retrying → (back to generating)
 *                                               ↓
 *                                           failed ✗
 *                                               ↓
 *                                       dead-lettered ✗
 */

export enum JobState {
  /** Received and waiting for processing slot */
  QUEUED = 'queued',
  
  /** Randomness generation in progress */
  GENERATING = 'generating',
  
  /** Submitting the response transaction to the network */
  SUBMITTING = 'submitting',
  
  /** Waiting for transaction confirmation on-chain */
  CONFIRMING = 'confirming',
  
  /** Transaction successfully sealed on-chain (terminal success) */
  CONFIRMED = 'confirmed',
  
  /** In a backoff window prior to the next attempt */
  RETRYING = 'retrying',
  
  /** Encountered a non-retriable execution error (terminal failure) */
  FAILED = 'failed',
  
  /** Exhausted all retries; requires manual operator rescue (terminal failure) */
  DEAD_LETTERED = 'dead-lettered',
}

export interface JobStateTransition {
  fromState: JobState;
  toState: JobState;
  timestamp: number;
  reason?: string;
  attemptNumber?: number;
}

export interface JobMetadata {
  requestId: string;
  raffleId: number;
  currentState: JobState;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  transitions: JobStateTransition[];
  lastError?: string;
  txHash?: string;
  ledger?: number;
}

export interface QueueConfig {
  /** Maximum number of retry attempts before dead-lettering */
  maxRetries: number;
  
  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;
  
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  
  /** Maximum backoff delay cap in milliseconds */
  maxBackoffMs: number;
  
  /** Timeout for transaction confirmation polling */
  confirmationTimeoutMs: number;
  
  /** Maximum concurrent jobs being processed */
  maxConcurrency: number;
  
  /** Timeout for randomness generation phase */
  generationTimeoutMs: number;
  
  /** Timeout for transaction submission phase */
  submissionTimeoutMs: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 5,
  initialBackoffMs: 2000,
  backoffMultiplier: 2,
  maxBackoffMs: 60000,
  confirmationTimeoutMs: 30000,
  maxConcurrency: 10,
  generationTimeoutMs: 15000,
  submissionTimeoutMs: 45000,
};

export interface QueueMetrics {
  /** Total jobs currently in queued state */
  queuedCount: number;
  
  /** Total jobs currently in generating state */
  generatingCount: number;
  
  /** Total jobs currently in submitting state */
  submittingCount: number;
  
  /** Total jobs currently in confirming state */
  confirmingCount: number;
  
  /** Total jobs currently in retrying state */
  retryingCount: number;
  
  /** Total jobs in confirmed state (success) */
  confirmedCount: number;
  
  /** Total jobs in failed state */
  failedCount: number;
  
  /** Total jobs in dead-lettered state (requires rescue) */
  deadLetteredCount: number;
  
  /** Total pending jobs (queued + generating + submitting + confirming + retrying) */
  pendingCount: number;
  
  /** Total failed jobs (failed + dead-lettered) */
  totalFailedCount: number;
}
