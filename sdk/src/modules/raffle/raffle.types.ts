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

/** Pre-confirmation fee preview for raffle creation (no submission). */
export interface CreateRaffleEstimate {
  /** Estimated network fee in human-readable XLM (7 decimal places). */
  xlm: string;
  /** Estimated network fee in stroops. */
  stroops: string;
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

// ─── Lifecycle additions (issue #602) ────────────────────────────────────────

/**
 * Valid state transitions in the raffle contract state machine:
 *
 *  Open ──► Drawing  (trigger_draw)
 *  Drawing ──► Finalized (receive_randomness → internal finalization)
 *  Open ──► Cancelled (cancel_raffle)
 *
 * Any other transition is rejected by the contract and surfaced as
 * `RaffleStateError`.
 */
export type RaffleTransition =
  | 'open→drawing'
  | 'drawing→finalized'
  | 'open→cancelled';

/**
 * Thrown when an operation is attempted in an invalid state.
 * E.g. calling `triggerDraw` on an already-finalized raffle.
 */
export class RaffleStateError extends Error {
  constructor(
    public readonly raffleId: number,
    public readonly currentStatus: RaffleStatus,
    public readonly attempted: RaffleTransition,
  ) {
    super(
      `Raffle ${raffleId} is in state ${RaffleStatus[currentStatus]} — ` +
        `transition "${attempted}" is not allowed.`,
    );
    this.name = 'RaffleStateError';
    Object.setPrototypeOf(this, RaffleStateError.prototype);
  }
}

/** Parameters for triggering the draw on an open raffle. */
export interface TriggerDrawParams {
  raffleId: number;
  memo?: TxMemo;
}

/** Result returned after triggering the draw. */
export interface TriggerDrawResult {
  txHash: string;
  ledger: number;
}

/** Result returned after a raffle is finalized with a winner. */
export interface WinnerResult {
  raffleId: number;
  winner: string;
  winningTicketId: number;
  prizeAmount: string;
  txHash?: string;
  ledger?: number;
}
