/**
 * @packageDocumentation
 * **@tikka/sdk/write** — Write (signing + submission) sub-path export for @tikka/sdk.
 *
 * Contains everything needed to build, sign, and submit Soroban transactions.
 * Consumers who only need read-only queries should import from `@tikka/sdk/read`
 * instead to avoid pulling in wallet adapter and signing overhead.
 *
 * ## Included
 * - `ContractService` — full invoke / simulate / buildUnsigned / submitSigned
 * - `TransactionLifecycle` — four-phase lifecycle (simulate → sign → submit → poll)
 * - All wallet adapters (Freighter, XBull, Albedo, LOBSTR, Rabet, Mock)
 * - `WalletAdapter` interface
 * - `sep10` auth helpers (`buildChallenge`, `verifyResponse`, `createInMemoryNonceStore`)
 * - `FeeEstimatorService`
 * - Write-side service classes (`RaffleService`, `TicketService`, `UserService`)
 * - All write-side types (`RaffleParams`, `BuyTicketParams`, `RefundTicketParams`, etc.)
 * - Re-exports everything from `@tikka/sdk/read` for convenience
 *
 * @example
 * ```ts
 * import { ContractService, FreighterAdapter } from '@tikka/sdk/write';
 * ```
 */

// ── Re-export the full read surface ─────────────────────────────────────────
export * from './index.read';

// ── Contract service & lifecycle ────────────────────────────────────────────
export { ContractService } from './contract/contract.service';
export type { InvokeOptions, UnsignedTxResult, TxMemo } from './contract/contract.service';
export { TransactionLifecycle } from './contract/lifecycle';
export type {
  SimulateResult,
  SubmitResult,
  PollConfig,
  InvokeLifecycleOptions,
} from './contract/lifecycle';

// ── Wallet adapters ──────────────────────────────────────────────────────────
export * from './wallet';

// ── Auth (SEP-10) ────────────────────────────────────────────────────────────
export * from './auth/sep10';

// ── Fee estimation ───────────────────────────────────────────────────────────
export * from './fee-estimator';

// ── Write-side service classes ───────────────────────────────────────────────
export { RaffleService } from './modules/raffle/raffle.service';
export { TicketService } from './modules/ticket/ticket.service';
export { UserService } from './modules/user/user.service';

// ── Write-side types ─────────────────────────────────────────────────────────
export type {
  RaffleParams,
  CreateRaffleResult,
  CancelRaffleResult,
  CancelRaffleParams,
} from './modules/raffle/raffle.types';
export type {
  BuyTicketParams,
  BuyTicketResult,
  RefundTicketParams,
  RefundTicketResult,
  BuyBatchParams,
  BuyBatchResult,
  BatchPurchaseResult,
  BatchTicketPurchase,
} from './modules/ticket/ticket.types';
