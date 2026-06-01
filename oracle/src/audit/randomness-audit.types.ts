export type RandomnessAuditStatus = 'pending' | 'succeeded' | 'failed';

export type RandomnessProvider = 'vrf' | 'prng';

export interface RandomnessRequestInput {
  raffleId: number;
  requestId: string;
  stableRequestId?: string;
  prizeAmount?: number;
  priority?: number;
  replayOverride?: boolean;
}

export interface RandomnessProofMetadata {
  seed: string;
  proof: string;
  seedLength: number;
  proofLength: number;
  seedDigest: string;
  proofDigest: string;
}

export interface RandomnessAuditRecord {
  id: number;
  request_id: string;
  stable_request_id: string | null;
  contract_event_id: string | null;
  queue_job_id: string | null;
  raffle_id: number;
  request_input: RandomnessRequestInput;
  provider: RandomnessProvider | null;
  proof_metadata: RandomnessProofMetadata | null;
  submission_tx_hash: string | null;
  submission_ledger: number | null;
  status: RandomnessAuditStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreateRandomnessAuditParams {
  requestInput: RandomnessRequestInput;
  contractEventId?: string;
  queueJobId?: string;
}

export interface CompleteRandomnessAuditParams {
  requestId: string;
  provider: RandomnessProvider;
  seed: string;
  proof: string;
  submissionTxHash: string;
  submissionLedger?: number;
}

export interface FailRandomnessAuditParams {
  requestId: string;
  errorMessage: string;
  provider?: RandomnessProvider;
  seed?: string;
  proof?: string;
}

export interface RandomnessAuditTrace {
  requestId: string;
  stableRequestId: string | null;
  contractEventId: string | null;
  queueJobId: string | null;
  raffleId: number;
  requestInput: RandomnessRequestInput;
  provider: RandomnessProvider | null;
  proofMetadata: RandomnessProofMetadata | null;
  submissionTxHash: string | null;
  submissionLedger: number | null;
  status: RandomnessAuditStatus;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  timeline: RandomnessAuditTraceStep[];
}

export interface RandomnessAuditTraceStep {
  phase: 'contract_event' | 'queue_job' | 'decision' | 'submission';
  at: string;
  detail: Record<string, unknown>;
}
