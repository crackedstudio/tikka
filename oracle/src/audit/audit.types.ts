export type AuditStatus = 'committed' | 'revealed' | 'abandoned';

export interface VrfAuditRecord {
  id: number;
  raffle_id: number;
  request_id: string | null;
  commitment_hash: string;
  reveal_hash: string | null;
  proof: string | null;
  seed: string | null;
  oracle_public_key: string;
  status: AuditStatus;
  committed_at: string; // ISO 8601
  revealed_at: string | null; // ISO 8601
  ledger_sequence: number | null;
  chain_hash: string;
  tx_hash: string | null;
}

export interface CreateCommitParams {
  raffleId: number;
  commitmentHash: string;
  oraclePublicKey: string;
  committedAt: Date;
}

export interface UpdateRevealParams {
  raffleId: number;
  requestId: string;
  secret: string;
  nonce: string;
  seed: string;
  proof: string;
  revealedAt: Date;
  ledgerSequence: number;
}

export interface RecordSubmissionParams {
  raffleId: number;
  vrfProof: string;
  txHash: string;
  ledger: number;
  oracleAddress: string;
  timestamp: Date;
  requestId?: string;
}

/**
 * A structured record emitted whenever oracle nodes submit divergent values
 * (i.e. consensus was not reached). Captured in the audit trail for investigation.
 */
export interface OracleDivergenceRecord {
  /** The VRF request ID that triggered the round. */
  requestId: string;
  /** The raffle ID associated with this randomness round, if known. */
  raffleId?: number;
  /**
   * Map of oracle ID → seed hash that oracle submitted.
   * Allows reconstructing exactly which nodes disagreed.
   */
  submittedValueHashes: Record<string, string>;
  /**
   * Map of oracle ID → Unix ms timestamp of their submission.
   * Populated from OracleSubmission.timestamp in the tracker path,
   * and from the local clock in the broadcastAndCollect path.
   */
  oracleTimestamps: Record<string, number>;
  /**
   * Seed-hash → vote count breakdown across all responding oracles.
   * Mirrors the seedGroups already computed by checkConsensus.
   */
  seedGroups: Record<string, number>;
  /**
   * The seed hash that received the plurality of votes (largest group),
   * even though it did not satisfy consensusThreshold. Null when no
   * submissions were received at all.
   */
  largestGroupHash: string | null;
  /** Number of oracles that returned a result in this round. */
  totalResponses: number;
  /** The minimum agreement count required to reach consensus. */
  consensusThreshold: number;
  /** ISO 8601 timestamp when the divergence was detected. */
  detectedAt: string;
}
