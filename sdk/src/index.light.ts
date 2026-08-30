/**
 * Light SDK entrypoint for browser/mobile consumers.
 *
 * Public exports:
 * - RpcService
 * - Raffle
 * - NetworkConfig
 * - ContractResponse
 * - light typings from `src/types.ts`
 *
 * Use this bundle when you want a small browser-friendly runtime without
 * NestJS module or decorator overhead. For full NestJS integration, use the
 * main SDK entrypoint (`@tikka/sdk`).
 */
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
export type { ContractResponse } from './contract/response';
export * from './types';