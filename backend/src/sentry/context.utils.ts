import * as Sentry from '@sentry/nestjs';
import { hashWallet } from './sentry';

// ---------------------------------------------------------------------------
// User context
// ---------------------------------------------------------------------------

export interface UserSentryContext {
  /** Raw wallet address — hashed before attaching. */
  address?: string | null;
  /** JWT-issued-at epoch seconds. */
  iat?: number | null;
}

/**
 * Attach authenticated user context to a Sentry scope.
 * The raw wallet address is never sent — only its 16-char SHA-256 prefix.
 */
export function setUserContext(scope: Sentry.Scope, user: UserSentryContext): void {
  const walletHash = hashWallet(user.address);
  if (walletHash) {
    scope.setTag('wallet_hash', walletHash);
    scope.setUser({ id: walletHash });
  }
  if (user.iat != null) {
    scope.setTag('token_iat', String(user.iat));
  }
}

// ---------------------------------------------------------------------------
// Job / queue context
// ---------------------------------------------------------------------------

export interface JobSentryContext {
  /** BullMQ job name. */
  jobName?: string | null;
  /** BullMQ job id. */
  jobId?: string | number | null;
  /** Queue name. */
  queue?: string | null;
  /** Number of attempts made so far. */
  attemptsMade?: number | null;
}

/**
 * Attach BullMQ job metadata to a Sentry scope.
 */
export function setJobContext(scope: Sentry.Scope, job: JobSentryContext): void {
  if (job.jobName) scope.setTag('job.name', job.jobName);
  if (job.jobId != null) scope.setTag('job.id', String(job.jobId));
  if (job.queue) scope.setTag('job.queue', job.queue);
  if (job.attemptsMade != null) scope.setTag('job.attempts', String(job.attemptsMade));
}

// ---------------------------------------------------------------------------
// Raffle context
// ---------------------------------------------------------------------------

export interface RaffleSentryContext {
  raffleId?: number | string | null;
  /** Contract address on Stellar. */
  contractAddress?: string | null;
  phase?: string | null;
}

/**
 * Attach raffle-specific metadata to a Sentry scope.
 * Contract address is attached as-is (it is a public on-chain identifier).
 */
export function setRaffleContext(scope: Sentry.Scope, raffle: RaffleSentryContext): void {
  if (raffle.raffleId != null) scope.setTag('raffle.id', String(raffle.raffleId));
  if (raffle.contractAddress) scope.setTag('raffle.contract', raffle.contractAddress);
  if (raffle.phase) scope.setTag('raffle.phase', raffle.phase);
}
