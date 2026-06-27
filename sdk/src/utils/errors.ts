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
    this.name = "RpcError";
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  static fromResponse(
    endpoint: string,
    method: string,
    response: any,
    payload?: any,
  ): RpcError {
    return new RpcError(
      `RPC request failed: ${response.statusText || "Unknown Error"}`,
      endpoint,
      method,
      response.status,
      payload,
    );
  }
}

export const ContractErrorType = {
  NETWORK_ERROR: "NETWORK_ERROR",
  CONTRACT_ERROR: "CONTRACT_ERROR",
  WALLET_ERROR: "WALLET_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  RAFFLE_NOT_FOUND: "RAFFLE_NOT_FOUND",
  RAFFLE_ENDED: "RAFFLE_ENDED",
  RAFFLE_FULL: "RAFFLE_FULL",
  UNAUTHORIZED: "UNAUTHORIZED",
  CONTRACT_PAUSED: "CONTRACT_PAUSED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ContractErrorType =
  (typeof ContractErrorType)[keyof typeof ContractErrorType];
export type SdkErrorCode = TikkaSdkErrorCode | ContractErrorType;

/**
 * SDK-wide error codes exactly as required by Issue #154
 */
export enum TikkaSdkErrorCode {
  /** Wallet extension not installed */
  WalletNotInstalled = "WALLET_NOT_INSTALLED",
  /** User rejected the transaction / signature request */
  UserRejected = "UserRejected",
  /** Transaction simulation failed */
  SimulationFailed = "SimulationFailed",
  /** Transaction submission failed */
  SubmissionFailed = "SUBMISSION_FAILED",
  /** Invalid parameters supplied (General) */
  InvalidParams = "INVALID_PARAMS",
  /** Contract returned an error */
  ContractError = "CONTRACT_ERROR",
  /** Network / RPC unreachable */
  NetworkError = "NetworkError",
  /** Timeout while waiting for confirmation */
  Timeout = "TIMEOUT",
  /** Rate limit exceeded */
  RateLimit = "RATE_LIMIT",
  /** Service unavailable */
  Unavailable = "UNAVAILABLE",
  /** Invalid response format or payload */
  InvalidResponse = "INVALID_RESPONSE",
  /** Contract execution failed */
  ContractFailure = "CONTRACT_FAILURE",
  /** Unknown / catch-all */
  Unknown = "UNKNOWN",
  /** Contract is paused — write operations blocked */
  ContractPaused = "CONTRACT_PAUSED",
  /** Caller is not authorized for this operation */
  Unauthorized = "UNAUTHORIZED",
  /** Validation failed for input parameters (raffleId, quantity, etc.) */
  ValidationError = "ValidationError",
  /** An external/cross-contract call (e.g. SEP-41 token) failed */
  ExternalContractError = "EXTERNAL_CONTRACT_ERROR",
}

/**
 * Structured SDK error (high-level, used across SDK)
 * Allows consumers to handle failures predictably.
 */
export class TikkaSdkError extends Error {
  constructor(
    public readonly code: SdkErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TikkaSdkError";
    // Essential for custom errors in TypeScript to maintain prototype chain
    Object.setPrototypeOf(this, TikkaSdkError.prototype);
  }

  /**
   * Static helper to wrap unknown errors into TikkaSdkError.
   * Useful in service-level catch blocks.
   */
  static wrap(
    error: unknown,
    defaultCode: SdkErrorCode = TikkaSdkErrorCode.Unknown,
  ): TikkaSdkError {
    return toTypedSdkError(error, defaultCode);
  }
}

abstract class ContractSdkError extends TikkaSdkError {
  constructor(code: ContractErrorType, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RaffleNotFoundError extends ContractSdkError {
  constructor(message = "Raffle not found", cause?: unknown) {
    super(ContractErrorType.RAFFLE_NOT_FOUND, message, cause);
  }
}

export class RaffleEndedError extends ContractSdkError {
  constructor(message = "Raffle has ended", cause?: unknown) {
    super(ContractErrorType.RAFFLE_ENDED, message, cause);
  }
}

export class RaffleFullError extends ContractSdkError {
  constructor(message = "Raffle is full", cause?: unknown) {
    super(ContractErrorType.RAFFLE_FULL, message, cause);
  }
}

export class InsufficientFundsError extends ContractSdkError {
  constructor(message = "Insufficient funds", cause?: unknown) {
    super(ContractErrorType.INSUFFICIENT_FUNDS, message, cause);
  }
}

export class UnauthorizedError extends ContractSdkError {
  constructor(message = "Unauthorized", cause?: unknown) {
    super(ContractErrorType.UNAUTHORIZED, message, cause);
  }
}

const CONTRACT_ERROR_FACTORIES: Record<
  number,
  (message: string, cause?: unknown) => TikkaSdkError
> = {
  1: (message, cause) => new RaffleNotFoundError(message, cause),
  3: (message, cause) => new RaffleFullError(message, cause),
  4: (message, cause) => new InsufficientFundsError(message, cause),
  5: (message, cause) => new UnauthorizedError(message, cause),
  35: (message, cause) => new RaffleEndedError(message, cause),
};

function stringifyErrorSource(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.message} ${stringifyErrorSource((value as any).cause)}`.trim();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function parseSorobanContractErrorCode(value: unknown): number | null {
  const source = stringifyErrorSource(value);
  const patterns = [
    /Error\(Contract,\s*#?(\d+)\)/i,
    /Contract\((\d+)\)/i,
    /contract(?:\s+error)?(?:\s+code)?[^\d]{0,10}(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

export function toTypedContractError(
  message: string,
  source?: unknown,
): TikkaSdkError | null {
  const contractErrorCode = parseSorobanContractErrorCode(source ?? message);
  if (contractErrorCode == null) {
    return null;
  }

  const factory = CONTRACT_ERROR_FACTORIES[contractErrorCode];
  if (!factory) {
    return new TikkaSdkError(TikkaSdkErrorCode.ContractError, message, source);
  }

  return factory(message, source);
}

export function toTypedSdkError(
  error: unknown,
  defaultCode: SdkErrorCode = TikkaSdkErrorCode.Unknown,
): TikkaSdkError {
  if (
    error instanceof RaffleNotFoundError ||
    error instanceof RaffleEndedError ||
    error instanceof RaffleFullError ||
    error instanceof InsufficientFundsError ||
    error instanceof UnauthorizedError
  ) {
    return error;
  }

  if (error instanceof TikkaSdkError) {
    const typed = toTypedContractError(
      error.message,
      error.cause ?? error.message,
    );
    return typed ?? error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const typed = toTypedContractError(message, error);
  return typed ?? new TikkaSdkError(defaultCode, message, error);
}

/**
 * Thrown when an RPC request times out.
 */
export class RpcTimeoutError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.Timeout, message, cause);
    this.name = "RpcTimeoutError";
    Object.setPrototypeOf(this, RpcTimeoutError.prototype);
  }
}

/**
 * Thrown when the RPC node returns a 429 Rate Limit status.
 */
export class RateLimitError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.RateLimit, message, cause);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when the RPC node or transport is unavailable (502, 503, 504, or network issues).
 */
export class UnavailableError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.Unavailable, message, cause);
    this.name = "UnavailableError";
    Object.setPrototypeOf(this, UnavailableError.prototype);
  }
}

/**
 * Thrown when the response format is invalid or cannot be parsed.
 */
export class InvalidResponseError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.InvalidResponse, message, cause);
    this.name = "InvalidResponseError";
    Object.setPrototypeOf(this, InvalidResponseError.prototype);
  }
}

/**
 * Thrown when a contract invocation or simulation fails due to a smart contract-specific failure.
 */
export class ContractFailureError extends TikkaSdkError {
  constructor(message: string, cause?: unknown) {
    super(TikkaSdkErrorCode.ContractFailure, message, cause);
    this.name = "ContractFailureError";
    Object.setPrototypeOf(this, ContractFailureError.prototype);
  }
}
