import { RaffleStatus } from '../../contract/bindings';

// ─── Source-of-truth annotation ───────────────────────────────────────────────
//
// Fields in view models below are annotated with their data source:
//   @source contract  — read via contract RPC (simulateReadOnly)
//   @source indexer   — requires a running indexer / backend query
//
// Pure contract queries work offline; indexer fields need a backend endpoint.

export interface UserParticipation {
  /** @source contract */
  address: string;
  /** Total distinct raffles the user has entered. @source contract */
  totalRafflesEntered: number;
  /** Total tickets purchased across all raffles. @source contract */
  totalTicketsBought: number;
  /** Total raffles won. @source contract */
  totalRafflesWon: number;
  /** IDs of all raffles the user has participated in. @source contract */
  raffleIds: number[];
}

/**
 * Parameters for querying user participation statistics.
 * @category User
 *
 * @example
 * ```ts
 * const params: GetParticipationParams = {
 *   address: userAddress
 * };
 * const result = await userService.getParticipation(params);
 * ```
 */
export interface GetParticipationParams {
  /** User's Stellar public key address to query */
  address: string;
}

// ─── Extended view models (issue #604) ───────────────────────────────────────

/** A single ticket held by the user. */
export interface UserTicket {
  /** @source contract */
  ticketId: number;
  /** @source contract */
  raffleId: number;
  /** ISO-8601 purchase timestamp. @source indexer */
  purchasedAt?: string;
}

/** Summary of the user's activity in a specific raffle. */
export interface UserRaffleActivity {
  /** @source contract */
  raffleId: number;
  /** @source contract */
  status: RaffleStatus;
  /** Tickets held by this user in this raffle. @source contract */
  ticketIds: number[];
  /** True when this user is the raffle creator. @source contract */
  isCreator: boolean;
  /** True when this user won the raffle. @source contract */
  isWinner: boolean;
  /** Prize amount in the raffle asset, only set when isWinner. @source contract */
  prizeAmount?: string;
}

/**
 * Aggregated view of all user activity — raffles, tickets, wins, refunds,
 * and creator activity — as required by issue #604.
 *
 * Fields annotated with `@source indexer` require a backend/indexer endpoint
 * and will be `undefined` when the SDK is used contract-only.
 */
export interface UserActivitySummary {
  /** User's Stellar address. @source contract */
  address: string;

  /** All raffles the user participated in. @source contract */
  raffles: UserRaffleActivity[];

  /** Flat list of all tickets owned. @source contract */
  tickets: UserTicket[];

  /** IDs of raffles won. @source contract */
  wonRaffleIds: number[];

  /** IDs of raffles created by this user. @source contract */
  createdRaffleIds: number[];

  /**
   * IDs of tickets that were refunded (raffle cancelled).
   * @source indexer — requires backend query; undefined when unavailable.
   */
  refundedTicketIds?: number[];

  /**
   * Total XLM (or asset) refunded across all refunded tickets.
   * @source indexer — undefined when unavailable.
   */
  totalRefunded?: string;

  /** Aggregate participation counts. @source contract */
  totals: {
    rafflesEntered: number;
    ticketsBought: number;
    rafflesWon: number;
    rafflesCreated: number;
  };
}

/** Parameters for fetching the aggregated user activity summary. */
export interface GetUserActivityParams {
  address: string;
  /**
   * When true, the SDK will also attempt to fetch indexer-backed data
   * (refunds, purchase timestamps). Requires `indexerUrl` to be configured.
   * Defaults to false.
   */
  includeIndexerData?: boolean;
}

/** A claimable prize entry returned by UserService.getWinnings. */
export interface WinningEntry {
  /** The raffle ID this prize belongs to. */
  raffleId: number;
  /** Prize amount as a string (e.g. "500"). */
  prizeAmount: string;
  /** Asset symbol for the prize (e.g. "XLM"). */
  prizeAsset: string;
  /** Whether this prize has already been claimed on-chain. */
  claimed: boolean;
}
