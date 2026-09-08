import os
import re

# Paths
base_dir = r"C:\Users\Stephan\Documents\tikka\oracle\src"
submitter_dir = os.path.join(base_dir, "submitter")
tx_submitter_file = os.path.join(submitter_dir, "tx-submitter.service.ts")
cost_estimator_file = os.path.join(submitter_dir, "cost-estimator.service.ts")

# 1. READ ALL FILES
with open(tx_submitter_file, "r", encoding="utf-8") as f:
    tx_content = f.read()

with open(cost_estimator_file, "r", encoding="utf-8") as f:
    cost_content = f.read()

# 2. GENERATE NEW FILES
# -- error-classifier.ts --
error_classifier_code = """import { TransactionOutcome } from './tx-submitter.service';
import { TelemetryContext } from './tx-submitter.service';

export class ErrorClassifier {
  constructor(private rpcUrls: string[], private currentRpcIndex: number) {}

  public classifyError(
    error: any,
    errorMessage: string,
    telemetry: TelemetryContext,
  ): TransactionOutcome {
    const normalized = errorMessage.toLowerCase();
    if (this.isInsufficientFeeError(normalized)) {
      return { status: 'INSUFFICIENT_FEE', error: errorMessage, retriable: true, currentFee: 0 };
    }
    if (this.isRpcError(normalized)) {
      return { status: 'NETWORK_ERROR', error: errorMessage, retriable: true, rpcUrl: this.rpcUrls[this.currentRpcIndex] };
    }
    if (this.isTimeoutError(normalized)) {
      return { status: 'TIMEOUT', error: errorMessage, retriable: true, pollAttempts: 0 };
    }
    if (this.isInvalidTransactionError(normalized)) {
      return { status: 'INVALID_TRANSACTION', error: errorMessage, retriable: false, validationError: errorMessage };
    }
    return { status: 'FAILED', error: errorMessage, retriable: false, failureReason: 'UNKNOWN_ERROR' };
  }

  public isDuplicateError(errorOrResponse: any): boolean {
    const str = JSON.stringify(errorOrResponse).toLowerCase();
    return str.includes('duplicate') || str.includes('tx_duplicate') || str.includes('already exists') || str.includes('already submitted');
  }

  public isTimeoutError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('timeout') || m.includes('504') || m.includes('timed out');
  }

  public isInvalidTransactionError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('invalid') || m.includes('malformed') || m.includes('unauthorized') || m.includes('forbidden');
  }

  public extractTxHashFromError(error: any): string | null {
    try {
      const str = JSON.stringify(error);
      const hashMatch = str.match(/[0-9a-f]{64}/i);
      return hashMatch ? hashMatch[0] : null;
    } catch {
      return null;
    }
  }

  public extractFailureReason(result: any): string {
    try {
      if (result.resultXdr) return `XDR: ${result.resultXdr}`;
      if (result.error) return result.error;
      return 'Unknown failure reason';
    } catch {
      return 'Failed to extract failure reason';
    }
  }

  public isInsufficientFeeError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('insufficient fee') || m.includes('tx_insufficient_fee');
  }

  public isRetriableError(error: unknown, message?: string): boolean {
    const normalized = (message || (error as any)?.message || String(error)).toLowerCase();
    if (this.isInsufficientFeeError(normalized) || this.isRpcError(normalized)) return true;
    if (normalized.includes('timeout') || normalized.includes('temporarily unavailable') || normalized.includes('try again') || normalized.includes('rate limit') || normalized.includes('too many requests')) return true;
    if (normalized.includes('invalid') || normalized.includes('malformed') || normalized.includes('unauthorized') || normalized.includes('forbidden') || normalized.includes('revert') || normalized.includes('failed (status=failed)')) return false;
    return false;
  }

  public isRpcError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('timeout') || m.includes('econnrefused') || m.includes('enotfound') || m.includes('503') || m.includes('502') || m.includes('500');
  }

  public errorToString(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try { return JSON.stringify(error); } catch { return String(error); }
  }
}
"""

with open(os.path.join(submitter_dir, "error-classifier.ts"), "w", encoding="utf-8") as f:
    f.write(error_classifier_code)

print("Done generating files!")
