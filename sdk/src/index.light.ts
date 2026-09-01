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
export type { NetworkConfig as LightNetworkConfig } from './types';
export * from './types';