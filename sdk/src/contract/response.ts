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
  status?: "SUCCESS" | "ERROR";
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

export type TicketTxResponse<T = number[]> = TxResponse<T>;
export type RaffleTxResponse<T = number> = TxResponse<T>;
export type AdminTxResponse<T = void> = TxResponse<T>;
export type UserTxResponse<T = any> = TxResponse<T>;
