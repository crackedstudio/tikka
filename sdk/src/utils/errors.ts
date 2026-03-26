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
  /** Contract is paused — write operations blocked */
  ContractPaused = 'CONTRACT_PAUSED',
  /** Caller is not authorized for this operation */
  Unauthorized = 'UNAUTHORIZED',
}

/**
 * Structured SDK error that carries a machine-readable code.
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
