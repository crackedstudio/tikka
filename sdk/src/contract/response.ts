import { InvalidResponseError } from '../utils/errors';

/**
 * Wrapper type for all contract operation responses.
 *
 * Represents the result of a contract invocation or simulation.
 * Operations return this generic interface to provide uniform
 * error handling across the SDK.
 *
 * @typeParam T - The type of the response value on success
 *
 * @example
 * ```ts
 * const response: ContractResponse<RaffleData> = await raffleService.getRaffle(raffleId);
 *
 * if (response.success) {
 *   // Access the typed value
 *   const raffle = response.value;
 *   console.log(`Raffle title: ${raffle.title}`);
 * } else {
 *   // Handle error
 *   console.error(`Failed: ${response.error}`);
 * }
 * ```
 */
export interface ContractResponse<T = any> {
  /** Legacy boolean success flag used by parts of the SDK. */
  success?: boolean;
  /** Legacy string status used by parts of the SDK. */
  status?: 'SUCCESS' | 'ERROR';
  /** The result value on success (undefined if failed) */
  value?: T;
  /** Error message describing what went wrong (undefined if succeeded) */
  error?: string;
  /** Transaction hash if this was a write operation */
  transactionHash?: string;
  /** Legacy transaction hash alias used by write flows. */
  txHash?: string;
  /** Ledger number where transaction was confirmed if applicable */
  ledger?: number;
  /** Fee aliases used by different SDK modules. */
  feeCharged?: string;
  feePaid?: string;
  resultXdr?: string;
  warnings?: string[];
}

export type TxResponse<T = any> = ContractResponse<T>;

export type TicketTxResponse<T = number[]> = ContractResponse<T>;
export type RaffleTxResponse<T = number> = ContractResponse<T>;
export type AdminTxResponse<T = void> = ContractResponse<T>;
export type UserTxResponse<T = any> = ContractResponse<T>;

/** Human-readable description of a raw value for error messages. */
function describeRaw(raw: unknown): string {
  if (raw === null) return 'null';
  if (Array.isArray(raw)) return 'array';
  return typeof raw;
}

/** Copies recognised optional metadata onto a normalised response. */
function withOptionalMetadata<T>(
  response: ContractResponse<T>,
  candidate: Record<string, unknown>,
): ContractResponse<T> {
  if (typeof candidate.transactionHash === 'string')
    response.transactionHash = candidate.transactionHash;
  if (typeof candidate.txHash === 'string') response.txHash = candidate.txHash;
  if (typeof candidate.ledger === 'number') response.ledger = candidate.ledger;
  if (typeof candidate.feeCharged === 'string') response.feeCharged = candidate.feeCharged;
  if (typeof candidate.feePaid === 'string') response.feePaid = candidate.feePaid;
  if (typeof candidate.resultXdr === 'string') response.resultXdr = candidate.resultXdr;
  if (Array.isArray(candidate.warnings)) {
    response.warnings = candidate.warnings.filter((w): w is string => typeof w === 'string');
  }
  return response;
}

/**
 * Normalises the two response conventions this SDK carries — the legacy
 * `success` boolean and the `status` string — into a single, fully populated
 * {@link ContractResponse}.
 *
 * Contract responses cross a trust boundary (RPC simulation output, raw
 * contract return values, downstream consumers), so this function is
 * deliberately total: every input either produces a well-formed success or
 * failure response, or throws a typed {@link InvalidResponseError}. It never
 * returns a partially populated object and never throws an unstructured error.
 *
 * @param raw - The value to normalise.
 * @param context - Label used in error messages (e.g. the calling method).
 * @throws {InvalidResponseError} when the value is not a recognised response.
 */
export function normalizeContractResponse<T = unknown>(
  raw: unknown,
  context = 'contract response',
): ContractResponse<T> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidResponseError(
      `${context}: expected a response object, received ${describeRaw(raw)}`,
      raw,
    );
  }

  const candidate = raw as Record<string, unknown>;
  const claimsSuccess = candidate.success === true || candidate.status === 'SUCCESS';
  const claimsFailure = candidate.success === false || candidate.status === 'ERROR';

  if (claimsSuccess && claimsFailure) {
    throw new InvalidResponseError(
      `${context}: response is marked as both success and failure`,
      raw,
    );
  }

  if (claimsFailure) {
    const error = candidate.error;
    if (typeof error !== 'string' || error.trim().length === 0) {
      throw new InvalidResponseError(
        `${context}: failure response is missing an error message`,
        raw,
      );
    }
    return withOptionalMetadata<T>({ success: false, status: 'ERROR' as const, error }, candidate);
  }

  if (claimsSuccess) {
    if (typeof candidate.error === 'string' && candidate.error.trim().length > 0) {
      throw new InvalidResponseError(`${context}: success response carries an error message`, raw);
    }
    return withOptionalMetadata<T>(
      { success: true, status: 'SUCCESS' as const, value: candidate.value as T },
      candidate,
    );
  }

  throw new InvalidResponseError(
    `${context}: unrecognised response shape (missing success flag and status)`,
    raw,
  );
}
