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
