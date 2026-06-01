/**
 * Canonical Soroban `pub fn` names for the raffle contract ABI.
 *
 * Must stay in sync with {@link ContractFn} in bindings.ts. After regenerating
 * from chain, update this list, bindings.ts, and CONTRACT_VERSION_METADATA.
 */
export const EXPECTED_CONTRACT_FUNCTIONS = [
  'accept_admin',
  'buy_ticket',
  'cancel_raffle',
  'create_raffle',
  'get_active_raffle_ids',
  'get_admin',
  'get_all_raffle_ids',
  'get_raffle_data',
  'get_user_participation',
  'get_user_tickets',
  'is_paused',
  'pause',
  'receive_randomness',
  'refund_ticket',
  'set_oracle_address',
  'set_protocol_fee',
  'transfer_admin',
  'trigger_draw',
  'unpause',
  'withdraw_fees',
] as const;

export type ExpectedContractFunction =
  (typeof EXPECTED_CONTRACT_FUNCTIONS)[number];
