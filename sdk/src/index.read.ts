/**
 * @packageDocumentation
 * **@tikka/sdk/read** — Read-only sub-path export for @tikka/sdk.
 *
 * Contains only the utilities needed to query raffle state from the Soroban
 * contract and the Stellar network.  No signing, no wallet adapters, no
 * submission code is included, so bundlers (Vite, Webpack, esbuild) can
 * tree-shake the write path entirely.
 *
 * ## Included
 * - `RpcService` — Soroban RPC client (simulate, getLedger, getTransaction)
 * - `HorizonService` — Horizon account / fee queries
 * - `NetworkConfig`, `RpcConfig`, `TESTNET_CONFIG`, `MAINNET_CONFIG`
 * - `ContractFn`, `RaffleStatus` — contract constants (no signing deps)
 * - `ContractResponse` — shared response envelope type
 * - Read-only types: `RaffleData`, `UserParticipation`, `GetParticipationParams`,
 *   `GetUserTicketsParams`, `AssetDescriptor`
 * - Utils: formatting, validation, errors, retry, BigNumber
 *
 * ## Excluded
 * - `ContractService` (requires wallet + TransactionBuilder)
 * - `TransactionLifecycle` (requires wallet + signing)
 * - All wallet adapters (Freighter, XBull, Albedo, LOBSTR, Rabet)
 * - `sep10` auth helpers
 * - `FeeEstimatorService`
 * - Write-side service classes (`RaffleService`, `TicketService`, `UserService`)
 * - NestJS modules
 *
 * @example
 * ```ts
 * import { RpcService, RaffleStatus, ContractFn } from '@tikka/sdk/read';
 * ```
 */

// ── Network (read-only) ──────────────────────────────────────────────────────
export { RpcService } from './network/rpc.service';
export { HorizonService } from './network/horizon.service';
export {
  resolveNetworkConfig,
  DEFAULT_RPC_CONFIG,
} from './network/network.config';
export type {
  NetworkConfig,
  RpcConfig,
  TikkaNetwork,
} from './network/network.config';

// ── Contract constants & response type ──────────────────────────────────────
export { ContractFn, RaffleStatus } from './contract/bindings';
export type { ContractFnName } from './contract/bindings';
export type { ContractResponse } from './contract/response';

// ── Read-only domain types ───────────────────────────────────────────────────
export type { RaffleData, AssetDescriptor } from './modules/raffle/raffle.types';
export type { GetUserTicketsParams } from './modules/ticket/ticket.types';
export type { UserParticipation, GetParticipationParams } from './modules/user/user.types';

// ── Read-only service classes ────────────────────────────────────────────────
export { ReadOnlyRaffleService } from './modules/raffle/raffle.read.service';
export { ReadOnlyUserService } from './modules/user/user.read.service';

// ── Utils ────────────────────────────────────────────────────────────────────
export * from './utils';
