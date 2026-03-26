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
    response: Response,
    payload?: any,
  ): RpcError {
    return new RpcError(
      `RPC request failed: ${response.statusText}`,
      endpoint,
      method,
      response.status,
      payload,
    );
  }
}

/**
 * SDK-wide error codes
 */
export enum TikkaSdkErrorCode {
  /** Wallet extension not installed */
  WalletNotInstalled = 'WALLET_NOT_INSTALLED',
  /** User rejected the transaction / signature request */
  UserRejected = 'USER_REJECTED',
  /** Transaction simulation failed */
  SimulationFailed = 'SIMULATION_FAILED',
  /** Transaction submission failed */
  SubmissionFailed = 'SUBMISSION_FAILED',
  /** Invalid parameters supplied */
  InvalidParams = 'INVALID_PARAMS',
  /** Contract returned an error */
  ContractError = 'CONTRACT_ERROR',
  /** Network / RPC unreachable */
  NetworkError = 'NETWORK_ERROR',
  /** Timeout while waiting for confirmation */
  Timeout = 'TIMEOUT',
  /** Unknown / catch-all */
  Unknown = 'UNKNOWN',
}

/**
 * Structured SDK error (high-level, used across SDK)
 */
export class TikkaSdkError extends Error {
  constructor(
    public readonly code: TikkaSdkErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TikkaSdkError';
  }
}