/** Lifecycle classification for a randomness / draw request. */
export type DrawRequestStatus = 'stuck' | 'pending' | 'confirmed' | 'failed';

export interface StuckDrawLedgerRange {
  /** Ledger when RandomnessRequested was observed (0 if unknown). */
  requestedAtLedger: number;
  /** Latest ledger seen by the lag monitor (0 if not yet synced). */
  currentLedger: number;
  /** currentLedger - requestedAtLedger when both are known. */
  lagLedgers: number;
}

export interface StuckDrawReportEntry {
  raffleId: number;
  requestId: string;
  jobId?: string;
  status: DrawRequestStatus;
  /** Milliseconds since the request was tracked or the queue job was created. */
  ageMs: number;
  /** ISO-8601 timestamp when tracking started (queue job or lag monitor). */
  since: string;
  contractStatus: string;
  queueState?: string;
  ledgerRange: StuckDrawLedgerRange;
  lastError: string | null;
  /** Operator-facing rescue command or guidance. */
  nextStep: string;
  /** Human-readable signals that contributed to classification. */
  signals: string[];
}

export interface StuckDrawReportSummary {
  stuck: number;
  pending: number;
  confirmed: number;
  failed: number;
  total: number;
}

export interface StuckDrawReport {
  timestamp: string;
  currentLedger: number;
  thresholds: {
    stuckLedgerLag: number;
    stuckQueueAgeMs: number;
    pendingHealthyMaxLedgerLag: number;
    pendingHealthyMaxAgeMs: number;
  };
  entries: StuckDrawReportEntry[];
  summary: StuckDrawReportSummary;
}
