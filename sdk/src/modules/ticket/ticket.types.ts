import { TxMemo } from '../../contract/contract.service';

export interface BuyTicketParams {
  raffleId: number;
  quantity: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

export interface BuyTicketResult {
  ticketIds: number[];
  txHash: string;
  ledger: number;
  feePaid: string;
}

export interface RefundTicketParams {
  raffleId: number;
  ticketId: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

export interface RefundTicketResult {
  txHash: string;
  ledger: number;
}

export interface GetUserTicketsParams {
  raffleId: number;
  userAddress: string;
}

export interface BatchTicketPurchase {
  raffleId: number;
  quantity: number;
}

export interface BuyBatchParams {
  purchases: BatchTicketPurchase[];
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

export interface BatchPurchaseResult {
  raffleId: number;
  ticketIds: number[];
  success: boolean;
  error?: string;
}

export interface BuyBatchResult {
  results: BatchPurchaseResult[];
  txHash: string;
  ledger: number;
  feePaid: string;
}
