export interface OracleConfig {
  id: string;
  publicKey: string;
  privateKey?: string;
  isLocal: boolean;
  weight: number;
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
