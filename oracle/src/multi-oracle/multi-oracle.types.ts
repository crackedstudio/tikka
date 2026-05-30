export interface OracleConfig {
  id: string;
  publicKey: string;
  privateKey?: string;
  isLocal: boolean;
  weight: number;
}

export interface PeerOracleEndpoint {
  id: string;
  url: string;
  publicKey: string;
}

export interface OracleSubmission {
  oracleId: string;
  publicKey: string;
  seed: string;
  proof: string;
  timestamp: number;
  txHash?: string;
}

export interface MultiOracleConfig {
  enabled: boolean;
  threshold: number;
  totalOracles: number;
  oracleIds: string[];
  localOracleId: string;
}

export interface RandomnessRequestWithOracles {
  raffleId: number;
  requestId: string;
  prizeAmount?: number;
  submissions: Map<string, OracleSubmission>;
  threshold: number;
}

export interface AggregatedRandomness {
  seed: string;
  proof: string;
  submittedBy: string[];
}

export enum MultiOracleMode {
  SINGLE = 'SINGLE',
  MULTI_INDEPENDENT = 'MULTI_INDEPENDENT',
  MULTI_COORDINATED = 'MULTI_COORDINATED',
}

export interface OracleRegistryEntry {
  id: string;
  publicKey: string;
  weight: number;
  isActive: boolean;
  lastSubmission?: number;
}

export interface SubmissionTracker {
  requestId: string;
  raffleId: number;
  submissions: Map<string, OracleSubmission>;
  threshold: number;
  completed: boolean;
  aggregatedSeed?: string;
}

/** Actions tracked in the oracle registry audit log. */
export type OracleAuditAction =
  | 'ADD_ORACLE'
  | 'REMOVE_ORACLE'
  | 'ENABLE_ORACLE'
  | 'DISABLE_ORACLE'
  | 'ADD_PEER'
  | 'REMOVE_PEER';

/** A single immutable audit record for a registry change. */
export interface OracleAuditEntry {
  action: OracleAuditAction;
  targetId: string;
  actor?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/** Safe, redacted view of the registry exposed to callers (no private keys). */
export interface OracleRegistrySnapshot {
  mode: MultiOracleMode;
  localOracleId: string;
  threshold: number;
  oracles: Array<Omit<OracleRegistryEntry, 'privateKey'>>;
  peerCount: number;
}
