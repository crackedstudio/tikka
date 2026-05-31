/**
 * transactionPipeline.ts — Issue #523
 *
 * FINDINGS (from reading contractService.ts, walletService.ts, types.ts):
 *
 * SDK: @stellar/stellar-sdk v14 (Soroban).
 *   - Build:    TransactionBuilder + contract.call() → unsigned Transaction
 *   - Estimate: sorobanRpcServer.simulateTransaction() — inline in submitTransaction today
 *   - Sign:     walletService.signTransaction(tx) via @creit.tech/stellar-wallets-kit
 *               Returns { success: boolean; signedTransaction?: any; error?: string }
 *               No typed UserRejectedRequestError — user rejection surfaces as thrown Error
 *               with message containing "rejected" / "cancelled" / "denied"
 *   - Submit:   sorobanRpcServer.sendTransaction() → { hash, status }
 *               status "ERROR" means immediate failure; "PENDING"/"TRY_AGAIN_LATER" need polling
 *   - Poll:     NOT implemented today — submitTransaction returns hash without waiting
 *   - Fee est:  simulateTransaction result used via rpc.assembleTransaction; no override today
 *
 * Error handling today: try/catch → ContractResponse<string> { success, data?, error? }
 * This module replaces that with a typed Result union so callers never need to catch.
 *
 * UI state today: CreateRaffleButton tracks currentStep/progress with manual setters.
 * After this refactor it receives PipelineProgressEvent via onProgress callback.
 *
 * Test framework: Vitest (globals: true, environment: jsdom).
 */

import { rpc } from "@stellar/stellar-sdk";
import type { Transaction } from "@stellar/stellar-sdk";
import { sorobanRpcServer } from "./rpcService";
import { signTransaction } from "./walletService";
import type { WalletSignResult } from "./walletService";

// ─── Public types ────────────────────────────────────────────────────────────

export type PipelineStage = "BUILD" | "ESTIMATE" | "SIGN" | "SUBMIT" | "POLL" | "DONE";

/**
 * Progress event emitted by `runPipeline` before and after each stage.
 *
 * - `BUILD pending/done/error`   — assembling the unsigned transaction
 * - `ESTIMATE pending/done/error` — simulating via Soroban RPC; `estimatedFee` is the
 *   assembled tx fee (or `feeOverride` if set) and is present only on `done`
 * - `SIGN pending/done/error`    — waiting for the wallet adapter to sign
 * - `SUBMIT pending/done/error`  — broadcasting to the network; `txHash` is present on `done`
 * - `POLL pending/done/error`    — polling for ledger finality; `confirmations` is always 1 on `done`
 * - `DONE done`                  — terminal success; `txHash` matches the SUBMIT hash
 *
 * An `error` status is the last event emitted for that stage; no further stages fire.
 */
export type PipelineProgressEvent =
  | { stage: "BUILD";    status: "pending" | "done" | "error" }
  | { stage: "ESTIMATE"; status: "pending" | "done" | "error"; estimatedFee?: string }
  | { stage: "SIGN";     status: "pending" | "done" | "error" }
  | { stage: "SUBMIT";   status: "pending" | "done" | "error"; txHash?: string }
  | { stage: "POLL";     status: "pending" | "done" | "error"; confirmations?: number }
  | { stage: "DONE";     status: "done"; txHash: string };

/**
 * Typed error returned (never thrown) by `runPipeline`.
 *
 * - `BUILD_FAILED`      — `buildTx` threw; `cause` is the original error
 * - `SIMULATION_FAILED` — Soroban RPC simulation returned an error or threw; `cause` is the raw response or error
 * - `INSUFFICIENT_FEES` — simulation error message indicates fee/balance problem; `estimatedFee` is `"unknown"`
 * - `USER_REJECTED`     — wallet adapter threw with "reject"/"cancel"/"denied"/"declined"/"user closed"
 * - `SIGNING_FAILED`    — wallet adapter threw for any other reason; `cause` is the original error
 * - `SUBMISSION_FAILED` — `sendTransaction` returned `status: "ERROR"` or threw; `cause` is the raw response or error
 * - `TIMEOUT`           — `pollTimeoutMs` elapsed before ledger confirmed; `txHash` is set if submission succeeded
 * - `FINALITY_FAILED`   — ledger returned `FAILED` status for the transaction; `txHash` identifies it
 */
export type PipelineError =
  | { code: "BUILD_FAILED";       message: string; cause?: unknown }
  | { code: "SIMULATION_FAILED";  message: string; cause?: unknown }
  | { code: "INSUFFICIENT_FEES";  message: string; estimatedFee: string }
  | { code: "USER_REJECTED";      message: string }
  | { code: "SIGNING_FAILED";     message: string; cause?: unknown }
  | { code: "SUBMISSION_FAILED";  message: string; cause?: unknown }
  | { code: "TIMEOUT";            message: string; txHash?: string }
  | { code: "FINALITY_FAILED";    message: string; txHash: string };

export type PipelineResult =
  | { ok: true;  data: PipelineSuccess }
  | { ok: false; error: PipelineError };

export interface PipelineSuccess {
  txHash: string;
  confirmedAt?: number; // ledger sequence
}

/**
 * Options accepted by `runPipeline`.
 */
export interface PipelineOptions {
  /**
   * Called synchronously on every stage transition (pending → done/error).
   * Use this to drive modal state in the UI. Safe to omit.
   */
  onProgress?: (event: PipelineProgressEvent) => void;
  /**
   * Override the fee reported in `ESTIMATE:done` and used for display.
   * Does not affect the actual fee negotiated by `rpc.assembleTransaction`.
   * Useful for fee-bump flows and tests. Default: assembled tx fee.
   */
  feeOverride?: string;
  /**
   * Maximum time (ms) to wait for ledger finality before returning `TIMEOUT`.
   * Default: `30_000`.
   */
  pollTimeoutMs?: number;
  /**
   * Delay (ms) between each `getTransaction` poll.
   * Default: `2_000`.
   */
  pollIntervalMs?: number;
}

export interface PipelineInput<TParams> {
  params: TParams;
  options?: PipelineOptions;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function emit(
  onProgress: PipelineOptions["onProgress"],
  event: PipelineProgressEvent,
): void {
  if (!onProgress) return;
  try {
    onProgress(event);
  } catch {
    // onProgress errors must never propagate into the pipeline
  }
}

/** Map wallet-kit errors to USER_REJECTED vs SIGNING_FAILED. */
function classifySignError(err: unknown): PipelineError {
  // Explicit typed rejection from walletService
  if (err instanceof Error && err.name === "WalletUserRejectedError") {
    return { code: "USER_REJECTED", message: err.message };
  }
  // Keyword fallback for wallet adapters that throw plain Errors
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    msg.includes("reject") ||
    msg.includes("cancel") ||
    msg.includes("denied") ||
    msg.includes("declined") ||
    msg.includes("user closed")
  ) {
    return { code: "USER_REJECTED", message: "Transaction was rejected by the user." };
  }
  return { code: "SIGNING_FAILED", message: "Failed to sign transaction.", cause: err };
}

/** Poll sorobanRpcServer until SUCCESS/FAILED or timeout. */
async function pollFinality(
  txHash: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<{ ok: true; ledger: number } | { ok: false; error: PipelineError }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    let response: rpc.Api.GetTransactionResponse;
    try {
      response = await sorobanRpcServer.getTransaction(txHash);
    } catch (_err) {
      // transient network error — keep polling until deadline
      continue;
    }

    if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { ok: true, ledger: response.ledger ?? 0 };
    }

    if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
      return {
        ok: false,
        error: { code: "FINALITY_FAILED", message: "Transaction failed on-chain.", txHash },
      };
    }
    // NOT_FOUND / other → keep polling
  }

  return {
    ok: false,
    error: { code: "TIMEOUT", message: "Timed out waiting for transaction finality.", txHash },
  };
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full BUILD → ESTIMATE → SIGN → SUBMIT → POLL pipeline for a Soroban transaction.
 *
 * Stage sequence:
 * 1. **BUILD**   — calls `buildTx(params)` to produce an unsigned `Transaction`
 * 2. **ESTIMATE** — simulates via `sorobanRpcServer.simulateTransaction`, assembles the
 *    prepared tx with `rpc.assembleTransaction`, and resolves the fee
 * 3. **SIGN**    — passes the prepared tx to `walletService.signTransaction`
 * 4. **SUBMIT**  — broadcasts via `sorobanRpcServer.sendTransaction`
 * 5. **POLL**    — polls `sorobanRpcServer.getTransaction` until `SUCCESS`, `FAILED`,
 *    or `pollTimeoutMs` elapses
 *
 * Progress contract:
 * - `onProgress` fires with `status: "pending"` before each stage starts
 * - `onProgress` fires with `status: "done"` (or `"error"`) after each stage completes
 * - On failure, the error stage emits `status: "error"` and no further stages run
 * - `onProgress` is optional; omitting it has no effect on pipeline behaviour
 *
 * Error guarantee:
 * - This function **never throws**. All failures are returned as `{ ok: false, error: PipelineError }`.
 * - Callers should switch on `result.ok` rather than wrapping in try/catch.
 *
 * @param buildTx  Contract-specific function that assembles the unsigned transaction from `params`
 * @param input    Pipeline input containing `params` and optional `PipelineOptions`
 * @returns        `{ ok: true, data: PipelineSuccess }` or `{ ok: false, error: PipelineError }`
 */
export async function runPipeline<TParams>(
  buildTx: (params: TParams) => Promise<Transaction>,
  input: PipelineInput<TParams>,
): Promise<PipelineResult> {
  try {
    return await _runPipeline(buildTx, input);
  } catch (err) {
    // Safety net: runPipeline must never throw under any circumstances.
    return { ok: false, error: { code: "BUILD_FAILED", message: "Unexpected pipeline error.", cause: err } };
  }
}

async function _runPipeline<TParams>(
  buildTx: (params: TParams) => Promise<Transaction>,
  input: PipelineInput<TParams>,
): Promise<PipelineResult> {
  const { params, options = {} } = input;
  const {
    onProgress,
    pollTimeoutMs = 30_000,
    pollIntervalMs = 2_000,
  } = options;

  // ── 1. BUILD ──────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "BUILD", status: "pending" });
  let unsignedTx: Transaction;
  try {
    unsignedTx = await buildTx(params);
  } catch (err) {
    emit(onProgress, { stage: "BUILD", status: "error" });
    return { ok: false, error: { code: "BUILD_FAILED", message: "Failed to build transaction.", cause: err } };
  }
  emit(onProgress, { stage: "BUILD", status: "done" });

  // ── 2. ESTIMATE ───────────────────────────────────────────────────────────
  emit(onProgress, { stage: "ESTIMATE", status: "pending" });
  let preparedTx: Transaction;
  let estimatedFee: string | undefined;
  try {
    const simResult = await sorobanRpcServer.simulateTransaction(unsignedTx);

    if (rpc.Api.isSimulationError(simResult)) {
      const msg = simResult.error ?? "Simulation failed";
      emit(onProgress, { stage: "ESTIMATE", status: "error" });
      // Detect insufficient-fee codes from Soroban simulation
      if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("fee")) {
        return {
          ok: false,
          error: { code: "INSUFFICIENT_FEES", message: msg, estimatedFee: "unknown" },
        };
      }
      return { ok: false, error: { code: "SIMULATION_FAILED", message: msg, cause: simResult } };
    }

    preparedTx = rpc.assembleTransaction(unsignedTx, simResult).build();
    // Extract fee from the assembled transaction
    estimatedFee = options.feeOverride ?? preparedTx.fee;
  } catch (err) {
    emit(onProgress, { stage: "ESTIMATE", status: "error" });
    return { ok: false, error: { code: "SIMULATION_FAILED", message: "Simulation threw unexpectedly.", cause: err } };
  }
  emit(onProgress, { stage: "ESTIMATE", status: "done", estimatedFee });

  // ── 3. SIGN ───────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "SIGN", status: "pending" });
  let signedTx: unknown;
  try {
    const signResult = await signTransaction(preparedTx);
    if (!signResult.success || !signResult.signedTransaction) {
      const pipelineErr = classifySignError(new Error(signResult.error ?? "sign returned no transaction"));
      emit(onProgress, { stage: "SIGN", status: "error" });
      return { ok: false, error: pipelineErr };
    }
    signedTx = signResult.signedTransaction;
  } catch (err) {
    const pipelineErr = classifySignError(err);
    emit(onProgress, { stage: "SIGN", status: "error" });
    return { ok: false, error: pipelineErr };
  }
  emit(onProgress, { stage: "SIGN", status: "done" });

  // ── 4. SUBMIT ─────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "SUBMIT", status: "pending" });
  let txHash: string;
  try {
    const submitResult = await sorobanRpcServer.sendTransaction(signedTx as Transaction);
    if (submitResult.status === "ERROR") {
      emit(onProgress, { stage: "SUBMIT", status: "error" });
      return {
        ok: false,
        error: {
          code: "SUBMISSION_FAILED",
          message: `Transaction submission failed: ${String(submitResult.errorResult ?? "unknown error")}`,
          cause: submitResult,
        },
      };
    }
    txHash = submitResult.hash;
  } catch (err) {
    emit(onProgress, { stage: "SUBMIT", status: "error" });
    return { ok: false, error: { code: "SUBMISSION_FAILED", message: "Failed to submit transaction.", cause: err } };
  }
  emit(onProgress, { stage: "SUBMIT", status: "done", txHash });

  // ── 5. POLL ───────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "POLL", status: "pending" });
  const pollResult = await pollFinality(txHash, pollTimeoutMs, pollIntervalMs);
  if (!pollResult.ok) {
    emit(onProgress, { stage: "POLL", status: "error" });
    return { ok: false, error: pollResult.error };
  }
  emit(onProgress, { stage: "POLL", status: "done", confirmations: 1 });

  // ── 6. DONE ───────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "DONE", status: "done", txHash });
  return { ok: true, data: { txHash, confirmedAt: pollResult.ledger } };
}
