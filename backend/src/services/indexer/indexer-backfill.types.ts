export interface HorizonTransactionRecord {
  id: string;
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  operationCount: number;
  successful: boolean;
}

export interface HorizonLedgerData {
  sequence: number;
  hash: string;
  closedAt: string;
  transactionCount: number;
  transactions: HorizonTransactionRecord[];
}

export interface BackfillSummary {
  startLedger: number;
  endLedger: number;
  totalLedgers: number;
  processedCount: number;
  skippedCount: number;
  missingLedgers: number[];
  elapsedMs: number;
}

export interface LedgerAttemptState {
  sequence: number;
  attempts: number;
  lastError: Error | null;
}
