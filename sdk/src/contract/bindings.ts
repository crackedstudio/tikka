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
  TRIGGER_DRAW: 'trigger_draw',
  RECEIVE_RANDOMNESS: 'receive_randomness',
  RECEIVE_RANDOMNESS_BATCH: 'receive_randomness_batch',
  CANCEL_RAFFLE: 'cancel_raffle',
  REFUND_TICKET: 'refund_ticket',

  // Queries
  GET_RAFFLE_DATA: 'get_raffle_data',
  GET_ACTIVE_RAFFLE_IDS: 'get_active_raffle_ids',
  GET_ALL_RAFFLE_IDS: 'get_all_raffle_ids',
  GET_USER_TICKETS: 'get_user_tickets',
  GET_USER_PARTICIPATION: 'get_user_participation',

  // Admin
  SET_ORACLE_ADDRESS: 'set_oracle_address',
  SET_PROTOCOL_FEE: 'set_protocol_fee',
  WITHDRAW_FEES: 'withdraw_fees',
  PAUSE: 'pause',
  UNPAUSE: 'unpause',
  TRANSFER_ADMIN: 'transfer_admin',
  ACCEPT_ADMIN: 'accept_admin',
  GET_ADMIN: 'get_admin',
  IS_PAUSED: 'is_paused',
} as const;

export type ContractFnName = (typeof ContractFn)[keyof typeof ContractFn];

/**
 * Raffle states as returned by get_raffle_data.
 */
export enum RaffleStatus {
  Open = 0,
  Drawing = 1,
  Finalized = 2,
  Cancelled = 3,
}
