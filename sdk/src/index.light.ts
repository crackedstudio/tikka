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
export { HorizonService } from './network/horizon.service';
export {
  NETWORK_PRESETS,
  SUPPORTED_NETWORKS,
  SOROBAN_RPC_MAX_RETRIES,
  SOROBAN_RPC_BASE_DELAY_MS,
  DEFAULT_RPC_CONFIG,
  resolveNetworkConfig,
  validateNetworkConfig,
} from './network/network.config';
export type {
  NetworkConfig,
  RpcConfig,
  TikkaNetwork,
} from './network/network.config';

/* Contract layer */
export { ContractService, type InvokeOptions } from './contract/contract.service';
export {
  TransactionLifecycle,
  validateLifecycleTransition,
  type TxMemo,
  type SimulateResult,
  type SubmitResult,
  type PollConfig,
  type InvokeLifecycleOptions,
} from './contract/lifecycle';
export {
  ContractFn,
  ContractFnName,
  RaffleStatus,
} from './contract/bindings';

/* Fee estimation */
export { FeeEstimatorService } from './fee-estimator/fee-estimator.service';
export type {
  EstimateFeeParams,
  FeeEstimateResult,
  FeeResourceBreakdown,
  FeeQuote,
  FeeQuoteConfidence,
  FeeQuoteSource,
  FeeQuoteWarning,
  GetFeeQuoteParams,
} from './fee-estimator/fee-estimator.types';

/* Domain services */
export { RaffleService } from './modules/raffle/raffle.service';
export { TicketService } from './modules/ticket/ticket.service';
export { UserService } from './modules/user/user.service';

/* Domain types */
export * from './modules/raffle/raffle.types';
export * from './modules/ticket/ticket.types';
export * from './modules/ticket/purchase-validation';
export * from './modules/user/user.types';

/* Wallet contract (interface + capabilities only) */
export { WalletAdapter, WalletName } from './wallet/wallet.interface';
export type {
  WalletAdapterOptions,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet/wallet.interface';

/* Response envelope types */
export type {
  ContractResponse,
  TxResponse,
  TicketTxResponse,
  RaffleTxResponse,
  AdminTxResponse,
  UserTxResponse,
} from './contract/response';

/* Utilities */
export * from './utils';

/* Light typings kept for backwards compatibility.
   The explicit `NetworkConfig` above wins over the `./types` re-export. */
export type { NetworkConfig as LightNetworkConfig } from './types';
export * from './types';