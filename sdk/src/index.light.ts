/**
 * Light SDK entrypoint for browser/mobile consumers (the "framework-agnostic"
 * bundle). The frontend consumes this entry — NOT the NestJS module surface.
 *
 * ## What is included
 *
 * - **Run-time services** used directly by web clients:
 *   `RpcService` (browser-safe), `HorizonService`, `ContractService`,
 *   `FeeEstimatorService`, `RaffleService`, `TicketService`, `UserService`,
 *   and the `TransactionLifecycle` stage methods behind them.
 * - **Wallet contract**: the `WalletAdapter` interface (implemented by the
 *   frontend wallet bridge) plus the wallet capability types. The concrete
 *   third-party adapters (Freighter/xBull/Albedo/... ) are intentionally NOT
 *   here — they pull in heavy dependencies.
 * - **Types & utils**: contract bindings (`ContractFn`, `RaffleStatus`),
 *   response envelope types, network config helpers, `RaffleParams`/`RaffleData`,
 *   ticket/user domain types, and the formatting/validation/error utilities.
 *
 * ## What is deliberately excluded
 *
 * - NestJS `*.module.ts` classes (DI container rooms) and the admin / auth /
 *   event-subscription modules — they drag in server concerns.
 * - The offline signing bundle helpers from the main entry.
 *
 * ## Decorators
 *
 * The services use NestJS `@Injectable`/`@Inject` metadata decorators which rely
 * on `reflect-metadata`. We import it here so consumers never need to remember
 * that step; the light build compiles with `emitDecoratorMetadata: false`.
 */
import 'reflect-metadata';

/* Network layer */
export { RpcService } from './light/rpc.service';
export {
  resolveNetworkConfig,
  DEFAULT_RPC_CONFIG,
  DEFAULT_RETRY_CONFIG,
  classifySorobanRpcError,
  buildRetryConfig,
} from './network/network.config';
export type {
  RpcConfig,
  RetryConfig,
  RetryDecision,
  RetryFailureClass,
  RetryJitter,
  RetryAttemptInfo,
} from './network/network.config';
/* The canonical NetworkConfig (rpcUrl, horizonUrl, networkPassphrase, network)
   and its network-name union — the shape every service constructor takes. */
export type { NetworkConfig, TikkaNetwork } from './network/network.config';
export type { NetworkConfig as LightNetworkConfig } from './types';
export * from './types';

/* Errors — the typed error surface (TikkaSdkError, TikkaSdkErrorCode and the
   typed contract error classes). errors.ts is dependency-free, so this stays
   inside the light bundle's zero-heavy-deps budget; clients need it to
   classify SDK failures (user rejection, wallet state, timeouts, …). */
export * from './utils/errors';
/* Formatting — the stroops/XLM converters the client maps contract amounts
   through (stroopsToXlm, xlmToStroops, truncateAddress, …). */
export * from './utils/formatting';

/* Runtime services — the contract interaction surface. Pulled in via the
   module files (not the NestJS modules), so no DI container ships to the
   browser. `@Injectable` decorators compile away with
   emitDecoratorMetadata: false; reflect-metadata is imported above for the
   metadata that remains. */
export { ContractFn, RaffleStatus } from './contract/bindings';
export { TxResponse } from './contract/response';
export type { TxMemo } from './contract/contract.service';
export type {
  SimulateResult,
  SubmitResult,
  PollConfig,
  InvokeLifecycleOptions,
} from './contract/lifecycle';
export { ContractService } from './contract/contract.service';
export { FeeEstimatorService } from './fee-estimator/fee-estimator.service';
export { RaffleService } from './modules/raffle/raffle.service';
export { TicketService } from './modules/ticket/ticket.service';
export { TicketReadService } from './modules/ticket/ticket.read.service';
export { UserService } from './modules/user/user.service';
export { HorizonService } from './network/horizon.service';
export { WalletAdapter, WalletName } from './wallet/wallet.interface';
export type {
  SignTransactionResult,
  WalletCapabilities,
  WalletAdapterOptions,
} from './wallet/wallet.interface';
