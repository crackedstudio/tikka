/**
 * Soroban contract bindings — typed wrappers that map SDK calls
 * to Soroban contract function names and argument shapes.
 *
 * If the contract ABI changes, regenerate with:
 *   stellar contract bindings typescript \
 *     --network testnet \
 *     --contract-id <CONTRACT_ID> \
 *     --output-dir ./src/contract/generated
 *
 * Until auto-generation is wired up, these hand-written bindings
 * serve as the canonical reference.
 */

/** Contract function names — must exactly match the Rust `pub fn` names. */
export const ContractFn = {
  // Lifecycle
  CREATE_RAFFLE: 'create_raffle',
  BUY_TICKET: 'buy_ticket',
  BUY_TICKETS_BATCH: 'buy_tickets_batch',
  TRIGGER_DRAW: 'trigger_draw',
  RECEIVE_RANDOMNESS: 'receive_randomness',
  CANCEL_RAFFLE: 'cancel_raffle',
  REFUND_TICKET: 'refund_ticket',
  CLAIM_PRIZE: 'claim_prize',

  // Queries
  GET_RAFFLE_DATA: 'get_raffle_data',
  GET_ACTIVE_RAFFLE_IDS: 'get_active_raffle_ids',
  GET_ALL_RAFFLE_IDS: 'get_all_raffle_ids',
  GET_USER_TICKETS: 'get_user_tickets',
  GET_USER_PARTICIPATION: 'get_user_participation',
  GET_RAFFLE_STATE: 'get_raffle_data',

  // Admin
  SET_ORACLE_ADDRESS: "set_oracle_address",
  SET_PROTOCOL_FEE: "set_protocol_fee",
  WITHDRAW_FEES: "withdraw_fees",
  PAUSE: "pause",
  UNPAUSE: "unpause",
  TRANSFER_ADMIN: "transfer_admin",
  ACCEPT_ADMIN: "accept_admin",
  GET_ADMIN: "get_admin",
  IS_PAUSED: "is_paused",
} as const;

export type ContractFnName = (typeof ContractFn)[keyof typeof ContractFn];

/**
 * Contract event topics — the canonical names the raffle contract emits.
 *
 * Every emitted event carries its name as the first topic / discriminant, and
 * that name is what the indexer routes on. This map is the reference the
 * indexer cross-checks against: `indexer/src/ingestor/handlers/all-handlers.spec.ts`
 * parses this file and asserts it matches the indexer's
 * `CONTRACT_EVENT_TOPICS`, so adding an event here without an indexer handler
 * (or vice versa) fails that test instead of the event being silently dropped.
 */
export const ContractEvent = {
  // Lifecycle
  RAFFLE_CREATED: 'RaffleCreated',
  TICKET_PURCHASED: 'TicketPurchased',
  RAFFLE_FINALIZED: 'RaffleFinalized',
  RAFFLE_CANCELLED: 'RaffleCancelled',
  TICKET_REFUNDED: 'TicketRefunded',

  // Randomness / draw
  DRAW_TRIGGERED: 'DrawTriggered',
  RANDOMNESS_REQUESTED: 'RandomnessRequested',
  RANDOMNESS_RECEIVED: 'RandomnessReceived',

  // Admin
  CONTRACT_PAUSED: 'ContractPaused',
  CONTRACT_UNPAUSED: 'ContractUnpaused',
  ADMIN_TRANSFER_PROPOSED: 'AdminTransferProposed',
  ADMIN_TRANSFER_ACCEPTED: 'AdminTransferAccepted',
} as const;

export type ContractEventName =
  (typeof ContractEvent)[keyof typeof ContractEvent];

/**
 * Raffle states as returned by get_raffle_data.
 */
import { RaffleStatus } from "@tikka/types";
export { RaffleStatus };
