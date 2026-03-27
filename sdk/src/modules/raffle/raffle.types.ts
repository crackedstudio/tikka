import { RaffleStatus } from '../../contract/bindings';
import { TxMemo } from '../../contract/contract.service';

/** Parameters for creating a new raffle. */
export interface RaffleParams {
  /** Ticket price in XLM (string to avoid float precision issues) */
  ticketPrice: string;
  /** Maximum number of tickets */
  maxTickets: number;
  /** Raffle end time — Unix timestamp in milliseconds */
  endTime: number;
  /** Whether a single address can buy multiple tickets */
  allowMultiple: boolean;
  /** Asset code — 'XLM' or a SEP-41 token contract address */
  asset: string;
  /** IPFS CID linking to off-chain metadata (title, image, etc.) */
  metadataCid?: string;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}

/** Result returned after successfully creating a raffle. */
export interface CreateRaffleResult {
  raffleId: number;
  txHash: string;
  ledger: number;
}

/** On-chain raffle data. */
export interface RaffleData {
  raffleId: number;
  creator: string;
  status: RaffleStatus;
  ticketPrice: string;
  maxTickets: number;
  ticketsSold: number;
  endTime: number;
  asset: string;
  allowMultiple: boolean;
  metadataCid: string;
  winner?: string;
  winningTicketId?: number;
  prizeAmount?: string;
}

/** Result of cancelling a raffle. */
export interface CancelRaffleResult {
  txHash: string;
  ledger: number;
}

/** Parameters for cancelling a raffle. */
export interface CancelRaffleParams {
  raffleId: number;
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}
