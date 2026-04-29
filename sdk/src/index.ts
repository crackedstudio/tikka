/**
 * @packageDocumentation
 * **@tikka/sdk** — NestJS SDK for interacting with the Tikka Soroban raffle contract on Stellar.
 *
 * ## Modules
 * - **Raffle** — create, fetch, list, and cancel raffles
 * - **Ticket** — buy and refund tickets; query user holdings
 * - **Wallet** — browser wallet adapters (Freighter, XBull, Albedo, LOBSTR)
 * - **User** — query on-chain participation data
 * - **Network** — RPC / Horizon service configuration
 * - **Utils** — formatting, validation, error classes
 *
 * @example
 * ```ts
 * import { RaffleService, TicketService, FreighterAdapter } from '@tikka/sdk';
 * ```
 */

// ── Contract bindings & types (public API surface) ──────────────────────────
export { ContractFn, RaffleStatus } from './contract/bindings';
export { ContractResponse } from './contract/response';
export type { TxMemo } from './contract/contract.service';
export { TransactionLifecycle } from './contract/lifecycle';
export type {
  SimulateResult,
  SubmitResult,
  PollConfig,
  InvokeLifecycleOptions,
} from './contract/lifecycle';

// ── Raffle ──────────────────────────────────────────────────────────────────
export * from './modules/raffle';

// ── Ticket ──────────────────────────────────────────────────────────────────
export * from './modules/ticket';

// ── User ────────────────────────────────────────────────────────────────────
export * from './modules/user';

// ── Wallet adapters ─────────────────────────────────────────────────────────
export * from './wallet';

// ── Network ─────────────────────────────────────────────────────────────────
export * from './network';

// ── Fee estimation ──────────────────────────────────────────────────────────
export * from './fee-estimator';

// ── Utils ───────────────────────────────────────────────────────────────────
export * from './utils';
