import { TransactionOutcome, TelemetryContext, TransactionState } from './tx-submitter.service';

export class ErrorClassifier {
  constructor(private rpcUrls: string[], private currentRpcIndex: number) {}

  public classifyError(
    error: any,
    errorMessage: string,
    telemetry: TelemetryContext,
  ): TransactionOutcome {
    const normalized = errorMessage.toLowerCase();

    if (this.isInsufficientFeeError(normalized)) {
      return {
        status: 'INSUFFICIENT_FEE',
        error: errorMessage,
        retriable: true,
        currentFee: 0, 
      };
    }

    // A submission timeout is ambiguous: the transaction may already have
    // landed. Classify it before generic RPC errors (which also match the
    // word "timeout") and do not mark it safe to retry.
    if (this.isTimeoutError(normalized)) {
      return {
        status: 'TIMEOUT',
        error: errorMessage,
        retriable: false,
        pollAttempts: 0,
      };
    }

    if (this.isRpcError(normalized)) {
      return {
        status: 'NETWORK_ERROR',
        error: errorMessage,
        retriable: true,
        rpcUrl: this.rpcUrls[this.currentRpcIndex],
      };
    }

    if (this.isInvalidTransactionError(normalized)) {
      return {
        status: 'INVALID_TRANSACTION',
        error: errorMessage,
        retriable: false,
        validationError: errorMessage,
      };
    }

    return {
      status: 'FAILED',
      error: errorMessage,
      retriable: false,
      failureReason: 'UNKNOWN_ERROR',
    };
  }

  public isDuplicateError(errorOrResponse: any): boolean {
    const str = `${this.errorToString(errorOrResponse)} ${this.safeJson(errorOrResponse)}`.toLowerCase();
    return (
      str.includes('duplicate') ||
      str.includes('tx_duplicate') ||
      str.includes('already exists') ||
      str.includes('already submitted')
    );
  }

  public isTimeoutError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('timeout') || m.includes('504') || m.includes('timed out');
  }

  public isInvalidTransactionError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('invalid') ||
      m.includes('malformed') ||
      m.includes('unauthorized') ||
      m.includes('forbidden')
    );
  }

  public extractTxHashFromError(error: any): string | null {
    try {
      const str = `${this.errorToString(error)} ${this.safeJson(error)}`;
      const hashMatch = str.match(/[0-9a-f]{64}/i);
      return hashMatch ? hashMatch[0] : null;
    } catch {
      return null;
    }
  }

  public extractFailureReason(result: any): string {
    try {
      if (result.resultXdr) {
        return 'transaction rejected (result XDR omitted)';
      }
      if (result.error) {
        return result.error;
      }
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

    if (this.isTimeoutError(normalized)) {
      return false;
    }

    if (this.isInsufficientFeeError(normalized) || this.isRpcError(normalized)) {
      return true;
    }

    if (
      normalized.includes('timeout') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('try again') ||
      normalized.includes('rate limit') ||
      normalized.includes('too many requests')
    ) {
      return true;
    }

    if (
      normalized.includes('invalid') ||
      normalized.includes('malformed') ||
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden') ||
      normalized.includes('revert') ||
      normalized.includes('failed (status=failed)')
    ) {
      return false;
    }

    return false;
  }

  public isRpcError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('econnrefused') ||
      m.includes('enotfound') ||
      m.includes('503') ||
      m.includes('502') ||
      m.includes('500')
    );
  }

  public errorToString(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return this.safeJson(error);
  }

  private safeJson(error: unknown): string {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
