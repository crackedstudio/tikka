import { TxMemo } from '../../contract/contract.service';

/**
 * Parameters for purchasing tickets in a raffle.
 * @category Ticket
 *
 * @example
 * ```ts
 * const params: BuyTicketParams = {
 *   raffleId: 42,
 *   quantity: 5,
 *   memo: 'My lucky raffle'
 * };
 * const result = await ticketService.buyTicket(params, signer);
 * ```
 */
export interface BuyTicketParams {
  /** ID of the raffle to purchase tickets for */
  raffleId: number;
  /** Number of tickets to purchase */
  quantity: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Result of a successful ticket purchase.
 * @category Ticket
 *
 * Contains the assigned ticket IDs and transaction details.
 *
 * @example
 * ```ts
 * if (result.success && result.value) {
 *   console.log(`Purchased tickets: ${result.value.ticketIds}`);
 *   console.log(`Fee paid: ${result.value.feePaid} stroops`);
 *   console.log(`Confirmed at block: ${result.value.ledger}`);
 * }
 * ```
 */
export interface BuyTicketResult {
  /** Array of assigned ticket IDs for this purchase */
  ticketIds: number[];
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
  /** Total fee paid for this transaction in stroops */
  feePaid: string;
}

/**
 * Parameters for refunding a previously purchased ticket.
 * @category Ticket
 *
 * @example
 * ```ts
 * const params: RefundTicketParams = {
 *   raffleId: 42,
 *   ticketId: 1001,
 *   memo: 'Changed my mind'
 * };
 * const result = await ticketService.refundTicket(params, signer);
 * ```
 */
export interface RefundTicketParams {
  /** ID of the raffle containing the ticket */
  raffleId: number;
  /** ID of the specific ticket to refund */
  ticketId: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Result of a successful ticket refund.
 * @category Ticket
 *
 * @example
 * ```ts
 * if (result.success) {
 *   console.log(`Refund confirmed at block: ${result.ledger}`);
 *   console.log(`Transaction: ${result.txHash}`);
 * }
 * ```
 */
export interface RefundTicketResult {
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
}

/**
 * Parameters for querying user tickets in a raffle.
 * @category Ticket
 *
 * @example
 * ```ts
 * const params: GetUserTicketsParams = {
 *   raffleId: 42,
 *   userAddress: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
 * };
 * const ticketIds = await ticketService.getUserTickets(params);
 * ```
 */
export interface GetUserTicketsParams {
  /** ID of the raffle to query */
  raffleId: number;
  /** User's Stellar public key address */
  userAddress: string;
}

/**
 * Single raffle purchase in a batch operation.
 * @category Ticket
 *
 * Represents one raffle and the quantity of tickets to purchase for it.
 * Used within {@link BuyBatchParams} for multi-raffle purchases.
 *
 * @example
 * ```ts
 * const purchase: BatchTicketPurchase = {
 *   raffleId: 42,
 *   quantity: 3
 * };
 * ```
 */
export interface BatchTicketPurchase {
  /** ID of the raffle to purchase tickets for */
  raffleId: number;
  /** Number of tickets to purchase for this raffle */
  quantity: number;
}

/**
 * Parameters for purchasing tickets across multiple raffles in one transaction.
 * @category Ticket
 *
 * Allows atomically purchasing tickets for multiple raffles while
 * keeping operational overhead lower than individual purchases.
 *
 * @example
 * ```ts
 * const params: BuyBatchParams = {
 *   purchases: [
 *     { raffleId: 42, quantity: 5 },
 *     { raffleId: 43, quantity: 3 },
 *     { raffleId: 44, quantity: 2 }
 *   ],
 *   memo: 'Bulk purchase'
 * };
 * const result = await ticketService.buyBatch(params, signer);
 * ```
 */
export interface BuyBatchParams {
  /** Array of raffle purchases to execute atomically */
  purchases: BatchTicketPurchase[];
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Result of a single raffle purchase within a batch operation.
 * @category Ticket
 *
 * Each purchase in a batch produces its own result status.
 *
 * @example
 * ```ts
 * const result: BatchPurchaseResult = {
 *   raffleId: 42,
 *   ticketIds: [1001, 1002, 1003],
 *   success: true
 * };
 * ```
 */
export interface BatchPurchaseResult {
  /** ID of the raffle this purchase is for */
  raffleId: number;
  /** Assigned ticket IDs if purchase was successful */
  ticketIds: number[];
  /** Whether this individual purchase succeeded */
  success: boolean;
  /** Error description if purchase failed */
  error?: string;
}

/**
 * Result of a batch ticket purchase operation.
 * @category Ticket
 *
 * Contains individual results for each raffle in the batch,
 * along with overall transaction details.
 *
 * @example
 * ```ts
 * if (result.success) {
 *   console.log(`Batch completed at block: ${result.ledger}`);
 *   result.results.forEach(r => {
 *     if (r.success) {
 *       console.log(`Raffle ${r.raffleId}: Got ${r.ticketIds.length} tickets`);
 *     } else {
 *       console.log(`Raffle ${r.raffleId}: ${r.error}`);
 *     }
 *   });
 * }
 * ```
 */
export interface BuyBatchResult {
  /** Array of individual purchase results for each raffle in the batch */
  results: BatchPurchaseResult[];
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
  /** Total fee paid for the entire batch in stroops */
  feePaid: string;
}
