import { TxMemo } from "../../contract/contract.service";

/**
 * Constraints for ticket operations to prevent invalid inputs.
 */
export const TICKET_CONSTRAINTS = {
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 1000,
  MAX_BATCH_SIZE: 100,
} as const;

/**
 * Parameters for purchasing tickets.
 * Quantity must be a positive integer between 1 and 1000.
 */
export interface BuyTicketParams {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** Number of tickets to purchase (1-1000) */
  quantity: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Parameters for purchasing multiple tickets in a batch.
 */
export interface BuyTicketsParams {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** Number of tickets to purchase (1-1000) */
  count: number;
  /** Maximum acceptable price per ticket in stroops */
  maxPricePerTicket: string;
  /**
   * Optional transaction memo for tracking or external integrations.
   */
  memo?: TxMemo;
}

/**
 * Result of a ticket purchase.
 * Provides transaction confirmation and purchased ticket IDs.
 */
export interface BuyTicketResult {
  /** Array of successfully purchased ticket IDs */
  ticketIds: number[];
  /** Transaction hash for confirmation */
  transactionHash: string;
  /** Ledger number where transaction was confirmed */
  ledger: number;
  /** Transaction fee paid in stroops */
  feePaid: string;
}

/**
 * Parameters for refunding a ticket.
 * Used when cancelling a raffle and returning funds to ticket holders.
 */
export interface RefundTicketParams {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** Ticket ID to refund (must be positive integer) */
  ticketId: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Result of a ticket refund.
 * Provides transaction confirmation.
 */
export interface RefundTicketResult {
  /** Transaction hash for confirmation */
  transactionHash: string;
  /** Ledger number where transaction was confirmed */
  ledger: number;
  /** Transaction fee paid in stroops */
  feePaid: string;
}

/**
 * Parameters for claiming a finalized raffle prize.
 */
export interface ClaimPrizeParams {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** Optional transaction memo for tracking or external integrations. */
  memo?: TxMemo;
}

/**
 * Result of a successful prize claim.
 */
export interface ClaimPrizeResult {
  /** Transaction hash for confirmation */
  transactionHash: string;
  /** Ledger number where transaction was confirmed */
  ledger: number;
  /** Transaction fee paid in stroops */
  feePaid: string;
}

/**
 * Parameters for querying user's tickets for a raffle.
 */
export interface GetUserTicketsParams {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** User's Stellar public key address */
  userAddress: string;
}

/**
 * Single purchase in a batch operation.
 */
export interface BatchTicketPurchase {
  /** Raffle ID (must be positive integer) */
  raffleId: number;
  /** Number of tickets to purchase (1-1000) */
  quantity: number;
}

/**
 * Parameters for batch ticket purchases across multiple raffles.
 * Supports up to 100 purchases per batch.
 */
export interface BuyBatchParams {
  /** Array of purchases (1-100 items) */
  purchases: BatchTicketPurchase[];
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/**
 * Result for a single purchase in a batch operation.
 * Indicates success or failure with error details if failed.
 */
export interface BatchPurchaseResult {
  /** Raffle ID for this purchase */
  raffleId: number;
  /** Array of purchased ticket IDs (empty if failed) */
  ticketIds: number[];
  /** Whether this purchase succeeded */
  success: boolean;
  /** Batch execution status */
  status?: "SUCCESS" | "ERROR";
  /** Error message if purchase failed */
  error?: string;
}

/**
 * Result of batch ticket purchases.
 * Provides individual results for each raffle and aggregate transaction info.
 */
export interface BuyBatchResult {
  /** Individual results for each raffle purchase */
  results: BatchPurchaseResult[];
  /** Transaction hash for confirmation (hash of last successful transaction) */
  transactionHash: string;
  /** Ledger number where last transaction was confirmed */
  ledger: number;
  /** Total transaction fee paid in stroops */
  feePaid: string;
}
