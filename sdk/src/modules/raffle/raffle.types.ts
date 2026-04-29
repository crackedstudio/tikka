import { RaffleStatus } from '../../contract/bindings';
import { TxMemo } from '../../contract/contract.service';

/**
 * Structured asset descriptor for ticket pricing.
 * Use `{ code: 'XLM' }` for native lumens, or provide `issuer` for SEP-41 tokens.
 */
export interface AssetDescriptor {
  /** Asset code, e.g. "XLM", "USDC", "yXLM" */
  code: string;
  /** Issuer account for non-native assets. Omit for XLM. */
  issuer?: string;
}

/** Parameters for creating a new raffle. */
export interface RaffleParams {
  /** Ticket price amount (string to avoid float precision issues) */
  ticketPrice: string;
  /**
   * Asset used for ticket pricing.
   * Accepts either a plain asset code string (e.g. "XLM") for backwards
   * compatibility, or a structured `AssetDescriptor` for non-native assets.
   *
   * @example { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' }
   */
  asset: string | AssetDescriptor;
  /** Maximum number of tickets */
  maxTickets: number;
  /** Raffle end time — Unix timestamp in milliseconds */
  endTime: number;
  /** Whether a single address can buy multiple tickets */
  allowMultiple: boolean;
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
  /** Resolved asset code, e.g. "XLM" or "USDC" */
  asset: string;
  /** Issuer account when asset is non-native */
  assetIssuer?: string;
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
