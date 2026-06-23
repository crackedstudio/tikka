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
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value on success (undefined if failed) */
  value?: T;
  /** Error message describing what went wrong (undefined if succeeded) */
  error?: string;
  /** Transaction hash if this was a write operation */
  transactionHash?: string;
  /** Ledger number where transaction was confirmed if applicable */
  ledger?: number;
  feeCharged?: string;
  resultXdr?: string;
  warnings?: string[];
}

export type TicketTxResponse<T = number[]> = TxResponse<T>;
export type RaffleTxResponse<T = number> = TxResponse<T>;
export type AdminTxResponse<T = void> = TxResponse<T>;
export type UserTxResponse<T = any> = TxResponse<T>;
