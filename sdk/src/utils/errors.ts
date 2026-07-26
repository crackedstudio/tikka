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
 /** Wallet extension installed but not connected/authorized */
  WalletNotConnected = 'WALLET_NOT_CONNECTED',
  /** No compatible wallet extension is installed in the browser */
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
  /** Rate limit exceeded */
  RateLimit = 'RATE_LIMIT',
  /** Service unavailable */
  Unavailable = 'UNAVAILABLE',
  /** Invalid response format or payload */
  InvalidResponse = 'INVALID_RESPONSE',
  /** Contract execution failed */
  ContractFailure = 'CONTRACT_FAILURE',
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
  /** Raffle is not in a state that permits the requested operation */
  RaffleEnded = 'RAFFLE_ENDED',
  /** Raffle ID does not correspond to an existing raffle */
  RaffleNotFound = 'RAFFLE_NOT_FOUND',
  /** Raffle has reached its maximum ticket capacity */
  RaffleFull = 'RAFFLE_FULL',
  /** Caller does not have sufficient balance to complete the operation */
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
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

/**
 * Thrown when an RPC request times out.
 */
export class RpcTimeoutError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.Timeout, message, cause);
    this.name = 'RpcTimeoutError';
    Object.setPrototypeOf(this, RpcTimeoutError.prototype);
  }
}

/**
 * Thrown when the RPC node returns a 429 Rate Limit status.
 */
export class RateLimitError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.RateLimit, message, cause);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when the RPC node or transport is unavailable (502, 503, 504, or network issues).
 */
export class UnavailableError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.Unavailable, message, cause);
    this.name = 'UnavailableError';
    Object.setPrototypeOf(this, UnavailableError.prototype);
  }
}

/**
 * Thrown when the response format is invalid or cannot be parsed.
 */
export class InvalidResponseError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.InvalidResponse, message, cause);
    this.name = 'InvalidResponseError';
    Object.setPrototypeOf(this, InvalidResponseError.prototype);
  }
}

/**
 * Thrown when a contract invocation or simulation fails due to a smart contract-specific failure.
 */
export class ContractFailureError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.ContractFailure, message, cause);
    this.name = 'ContractFailureError';
    Object.setPrototypeOf(this, ContractFailureError.prototype);
  }
}

// ─── Typed Contract Errors ─────────────────────────────────────────────────
//
// These map specific on-chain Soroban contract error codes (panic codes
// returned by the `tikka-raffle` contract) to typed SDK errors, so callers
// can `catch (err) { if (err instanceof RaffleEndedError) ... }` instead of
// string-matching messages.

/**
 * Contract-level error identifiers.
 * Values are aliases of the corresponding `TikkaSdkErrorCode` members so
 * `err.code` comparisons work against either enum interchangeably.
 */
export const ContractErrorType = {
  RAFFLE_NOT_FOUND: TikkaSdkErrorCode.RaffleNotFound,
  RAFFLE_ENDED: TikkaSdkErrorCode.RaffleEnded,
  RAFFLE_FULL: TikkaSdkErrorCode.RaffleFull,
  INSUFFICIENT_FUNDS: TikkaSdkErrorCode.InsufficientFunds,
  UNAUTHORIZED: TikkaSdkErrorCode.Unauthorized,
} as const;

/** Thrown when a referenced raffle ID does not exist on-chain. */
export class RaffleNotFoundError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.RaffleNotFound, message, cause);
    this.name = 'RaffleNotFoundError';
    Object.setPrototypeOf(this, RaffleNotFoundError.prototype);
  }
}

/** Thrown when an operation requires OPEN state but the raffle has moved on. */
export class RaffleEndedError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.RaffleEnded, message, cause);
    this.name = 'RaffleEndedError';
    Object.setPrototypeOf(this, RaffleEndedError.prototype);
  }
}

/** Thrown when a raffle has sold its maximum number of tickets. */
export class RaffleFullError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.RaffleFull, message, cause);
    this.name = 'RaffleFullError';
    Object.setPrototypeOf(this, RaffleFullError.prototype);
  }
}

/** Thrown when the caller's balance is insufficient for the operation. */
export class InsufficientFundsError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.InsufficientFunds, message, cause);
    this.name = 'InsufficientFundsError';
    Object.setPrototypeOf(this, InsufficientFundsError.prototype);
  }
}

/** Thrown when the caller lacks permission for an admin/creator-only action. */
export class UnauthorizedError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.Unauthorized, message, cause);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Maps a known Soroban contract panic code to its typed error class.
 * Extend this table as new contract error codes are added.
 */
const CONTRACT_ERROR_CODE_MAP: Record<number, new (message: string, cause?: unknown) => TikkaSdkError> = {
  1: RaffleNotFoundError,
  3: RaffleFullError,
  4: InsufficientFundsError,
  5: UnauthorizedError,
  35: RaffleEndedError,
};

/**
 * Extracts a numeric Soroban contract error code from a raw error string.
 * Recognizes the common formats surfaced by the Stellar RPC / SDK:
 *   - "Error(Contract, #35)"
 *   - "ScError::Contract(4)"
 *   - "contract error code 5"
 *
 * @returns the parsed code, or `undefined` if no recognizable pattern is found.
 */
export function parseSorobanContractErrorCode(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;

  const patterns = [
    /Error\(Contract,\s*#(\d+)\)/,
    /ScError::Contract\((\d+)\)/,
    /contract error code\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * Attempts to convert a raw contract failure (message + raw error/XDR string)
 * into a typed SDK error based on the embedded Soroban contract error code.
 *
 * @param message  Human-readable message to attach to the typed error.
 * @param rawError Raw error string (e.g. simulation error or resultXdr) to parse.
 * @returns a typed `TikkaSdkError` subclass instance, or `null` if the code
 *          is unrecognized (callers should fall back to a generic error).
 */
export function toTypedContractError(message: string, rawError: string): TikkaSdkError | null {
  const code = parseSorobanContractErrorCode(rawError);
  if (code === undefined) return null;

  const ErrorClass = CONTRACT_ERROR_CODE_MAP[code];
  if (!ErrorClass) return null;

  return new ErrorClass(message, rawError);
}

/**
 * Upgrades a generic caught error into the most specific `TikkaSdkError`
 * subtype possible. If `err` is already a `TikkaSdkError` with code
 * `ContractError` and a string `cause` containing a recognizable Soroban
 * error code, it is converted into the matching typed error. Otherwise the
 * error is returned unchanged (if already a `TikkaSdkError`) or wrapped.
 */
export function toTypedSdkError(err: unknown): TikkaSdkError {
  if (err instanceof TikkaSdkError) {
    if (err.code === TikkaSdkErrorCode.ContractError && typeof err.cause === 'string') {
      const typed = toTypedContractError(err.message, err.cause);
      if (typed) return typed;
    }
    return err;
  }
  return TikkaSdkError.wrap(err);
}
