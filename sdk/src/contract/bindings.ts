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