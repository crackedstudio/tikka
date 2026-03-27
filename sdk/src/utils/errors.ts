/**
 * Low-level RPC error (transport / HTTP / JSON-RPC failures)
 */
export class RpcError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly method?: string,
    public readonly statusCode?: number,
    public readonly response?: any,
  ) {
    super(message);
    this.name = 'RpcError';
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  static fromResponse(
    endpoint: string,
    method: string,
    response: any,
    payload?: any,
  ): RpcError {
    return new RpcError(
      `RPC request failed: ${response.statusText || 'Unknown Error'}`,
      endpoint,
      method,
      response.status,
      payload,
    );
  }
}

/**
 * SDK-wide error codes exactly as required by Issue #154
 */
export enum TikkaSdkErrorCode {
  /** Wallet extension not installed */
  WalletNotInstalled = 'WALLET_NOT_INSTALLED',
  /** User rejected the transaction / signature request */
  UserRejected = 'UserRejected',
  /** Transaction simulation failed */
  SimulationFailed = 'SimulationFailed',
  /** Transaction submission failed */
  SubmissionFailed = 'SUBMISSION_FAILED',
  /** Invalid parameters supplied (General) */
  InvalidParams = 'INVALID_PARAMS',
  /** Contract returned an error */
  ContractError = 'CONTRACT_ERROR',
  /** Network / RPC unreachable */
  NetworkError = 'NetworkError',
  /** Timeout while waiting for confirmation */
  Timeout = 'TIMEOUT',
  /** Unknown / catch-all */
  Unknown = 'UNKNOWN',
  /** Contract is paused — write operations blocked */
  ContractPaused = 'CONTRACT_PAUSED',
  /** Caller is not authorized for this operation */
  Unauthorized = 'UNAUTHORIZED',
  /** Validation failed for input parameters (raffleId, quantity, etc.) */
  ValidationError = 'ValidationError',
  /** An external/cross-contract call (e.g. SEP-41 token) failed */
  ExternalContractError = 'EXTERNAL_CONTRACT_ERROR',
}

/**
 * Structured SDK error (high-level, used across SDK)
 * Allows consumers to handle failures predictably.
 */
export class TikkaSdkError extends Error {
  constructor(
    public readonly code: TikkaSdkErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TikkaSdkError';
    // Essential for custom errors in TypeScript to maintain prototype chain
    Object.setPrototypeOf(this, TikkaSdkError.prototype);
  }

  /**
   * Static helper to wrap unknown errors into TikkaSdkError.
   * Useful in service-level catch blocks.
   */
  static wrap(error: unknown, defaultCode: TikkaSdkErrorCode = TikkaSdkErrorCode.Unknown): TikkaSdkError {
    if (error instanceof TikkaSdkError) return error;
    
    const message = error instanceof Error ? error.message : String(error);
    return new TikkaSdkError(defaultCode, message, error);
  }
}