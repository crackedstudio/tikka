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
 * A record of a chain anchor — a point-in-time snapshot of the chain head
 * that has been published or stored in a separate location. An attacker who
 * can rewrite the entire vrf_audit_log table *and* this anchor table can
 * still falsify history, which is why anchors should be published to a
 * public bulletin (e.g. a tweet, a GitHub Gist, or an on-chain hash).
 */
export interface AuditChainAnchor {
  id: number;
  /** The chain_hash of the last record that was anchored. */
  chain_head_hash: string;
  /** Total number of audit records when this anchor was created. */
  record_count: number;
  /** ISO 8601 timestamp when the anchor was created. */
  anchored_at: string;
  /** Free-text reason or identifier for the anchor (e.g. "cli", "scheduled-cron"). */
  anchor_type: string;
  /** Optional external reference URL or hash where the anchor was published. */
  external_ref: string | null;
}

/**
 * Result of walking the audit chain and checking every link.
 */
export interface ChainVerificationResult {
  valid: boolean;
  total_records: number;
  /** Index (1-based) of the first broken link, or null if the chain is valid. */
  first_broken_at: number | null;
  /** ID of the record whose chain_hash does not match, or null. */
  first_broken_record_id: number | null;
  /** Expected chain_hash value at the first broken record, or null. */
  expected_hash: string | null;
  /** Stored chain_hash value at the first broken record, or null. */
  stored_hash: string | null;
}

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
