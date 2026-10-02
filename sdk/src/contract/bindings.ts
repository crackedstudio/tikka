/**
 * Soroban contract bindings — typed wrappers that map SDK calls
 * to Soroban contract function names and argument shapes.
 *
 * The canonical generated bindings live in `./generated/bindings.ts`.
 * This file re-exports them for backward compatibility.
 *
 * To regenerate after a contract ABI change:
 *   stellar contract bindings typescript \
 *     --network testnet \
 *     --contract-id <CONTRACT_ID> \
 *     --output-dir ./src/contract/generated
 *
 * See sdk/CONTRACT_BINDINGS_VERIFICATION.md for details.
 */

export {
  ContractFn,
  type ContractFnName,
  type CreateRaffleParams,
  type BuyTicketParams,
  type BuyTicketsBatchParams,
  type TriggerDrawParams,
  type ReceiveRandomnessParams,
  type CancelRaffleParams,
  type RefundTicketParams,
  type ClaimPrizeParams,
  type SetOracleAddressParams,
  type SetProtocolFeeParams,
  type WithdrawFeesParams,
  type TransferAdminParams,
  type GetRaffleDataParams,
  type GetUserTicketsParams,
  type GetUserParticipationParams,
  type RaffleData,
  type UserParticipation,
} from './generated/bindings';

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

/**
 * Maps the numeric `status` returned by `get_raffle_data` onto the
 * `RaffleStatus` enum exposed by the SDK.
 *
 * The contract stores the state as a `u32` (0 = Open, 1 = Drawing,
 * 2 = Finalized, 3 = Cancelled), while consumers work with the string enum.
 * Unknown values fall back to `OPEN`, matching the write path.
 */
export function mapContractStatus(status: number): RaffleStatus {
  switch (status) {
    case 0:
      return RaffleStatus.OPEN;
    case 1:
      return RaffleStatus.DRAWING;
    case 2:
      return RaffleStatus.FINALIZED;
    case 3:
      return RaffleStatus.CANCELLED;
    default:
      return RaffleStatus.OPEN;
  }
}
