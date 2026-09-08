/**
 * transactionPipeline.ts — Issue #523 / SDK-consumption refactor.
 *
 * This module is now a **thin progress-emitter adapter** over the `@tikka/sdk`
 * `ContractService` stage methods (`simulate` → `sign` → `submit` → `poll`).
 * All transaction mechanics — building, fee bumping, auth gathering, signing,
 * submission, polling — live in the SDK (`TransactionLifecycle`). This file only:
 *
 *   1. Sequences the stage calls so the UI can watch BUILD→ESTIMATE→SIGN→
 *      SUBMIT→POLL→DONE progress via `PipelineProgressEvent`.
 *   2. Translates SDK `TikkaSdkError`s into the typed `PipelineError` union the
 *      UI already knows how to display.
 *
 * The BUILD stage is a UI-compat no-op: the SDK performs build + simulate
 * atomically inside `simulate`, so there is no separate unsigned-transaction
 * build step to report.
 *
 * Error guarantee: `runPipeline` never throws — every failure is returned as
 * `{ ok: false, error: PipelineError }`.
 */

import {
  TikkaSdkError,
  TikkaSdkErrorCode,
} from "@tikka/sdk";
import type {
  SimulateResult,
  SubmitResult,
  PollConfig,
  TxMemo,
} from "@tikka/sdk";

// ─── Public types ────────────────────────────────────────────────────────────

export type PipelineStage = "BUILD" | "ESTIMATE" | "SIGN" | "SUBMIT" | "POLL" | "DONE";

/**
 * Progress event emitted by `runPipeline` before and after each stage.
 *
 * - `BUILD pending/done/error`   — UI-compat no-op stage (the SDK builds inside `simulate`)
 * - `ESTIMATE pending/done/error` — simulating via Soroban RPC; `estimatedFee` is the
 *   simulation's `minResourceFee` (or `feeOverride` if set) and is present only on `done`
 * - `SIGN pending/done/error`    — waiting for the SDK wallet adapter to sign
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
 * - `BUILD_FAILED`      — unexpected pipeline failure; `cause` is the original error
 * - `SIMULATION_FAILED` — SDK simulation threw; `cause` is the original error
 * - `INSUFFICIENT_FEES` — simulation error message indicates fee/balance problem; `estimatedFee` is `"unknown"`
 * - `USER_REJECTED`     — user dismissed the wallet signing prompt
 * - `SIGNING_FAILED`    — wallet unavailable/not connected or signing failed; `cause` is the original error
 * - `SUBMISSION_FAILED` — SDK submit threw; `cause` is the original error
 * - `TIMEOUT`           — SDK poll timed out; `txHash` is set once submission succeeded
 * - `FINALITY_FAILED`   — ledger/chain rejected the transaction; `txHash` identifies it
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
   * Does not affect the fee actually negotiated by the SDK simulation.
   * Default: the SDK `minResourceFee`.
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

/**
 * Minimal contract fulfilled by the SDK `ContractService` stage methods, so
 * tests can inject a fake without pulling the whole SDK transport in.
 */
export interface SdkPipelineTarget {
  simulate<T = unknown>(
    method: string,
    params: unknown[],
    options?: { sourcePublicKey?: string; fee?: string; memo?: TxMemo },
  ): Promise<SimulateResult<T>>;
  sign(
    assembledXdr: string,
    networkPassphrase?: string,
  ): Promise<string>;
  submit(signedXdr: string): Promise<string>;
  poll<T = unknown>(
    txHash: string,
    config?: PollConfig,
  ): Promise<SubmitResult<T>>;
}

export interface PipelineInput {
  /** The SDK ContractService stage methods to drive. */
  target: SdkPipelineTarget;
  /** Contract function name, e.g. `ContractFn.CREATE_RAFFLE`. */
  method: string;
  /** Contract parameter list (native values or pre-built scVals — the SDK converts). */
  params: unknown[];
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

function codeOf(err: unknown): TikkaSdkErrorCode | undefined {
  return err instanceof TikkaSdkError ? err.code : undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Translates a thrown SDK `TikkaSdkError` into the typed `PipelineError` union,
 * for callers that drive a single SDK entry point (e.g. `TicketService`) rather
 * than the stage-by-stage pipeline.
 */
export function sdkErrorToPipelineError(
  err: unknown,
  opts: { txHash?: string } = {},
): PipelineError {
  const code = codeOf(err);
  const msg = messageOf(err);

  switch (code) {
    case TikkaSdkErrorCode.UserRejected:
      return { code: "USER_REJECTED", message: "Transaction was rejected by the user." };
    case TikkaSdkErrorCode.WalletNotConnected:
    case TikkaSdkErrorCode.WalletNotInstalled:
      return { code: "SIGNING_FAILED", message: msg, cause: err };
    case TikkaSdkErrorCode.Timeout:
      return { code: "TIMEOUT", message: msg, txHash: opts.txHash };
    case TikkaSdkErrorCode.NetworkError:
    case TikkaSdkErrorCode.Unavailable:
    case TikkaSdkErrorCode.RateLimit:
      return { code: "SUBMISSION_FAILED", message: msg, cause: err };
    default:
      if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("fee")) {
        return { code: "INSUFFICIENT_FEES", message: msg, estimatedFee: "unknown" };
      }
      return { code: "SUBMISSION_FAILED", message: msg, cause: err };
  }
}

/** ESTIMATE-stage classifier (keeps the old INSUFFICIENT_FEES heuristic). */
function estimateError(err: unknown): PipelineError {
  const code = codeOf(err);
  if (code === TikkaSdkErrorCode.Timeout || code === TikkaSdkErrorCode.NetworkError) {
    return { code: "SIMULATION_FAILED", message: messageOf(err), cause: err };
  }
  const msg = messageOf(err);
  if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("fee")) {
    return { code: "INSUFFICIENT_FEES", message: msg, estimatedFee: "unknown" };
  }
  return { code: "SIMULATION_FAILED", message: msg, cause: err };
}

/** SIGN-stage classifier. */
function signError(err: unknown): PipelineError {
  if (codeOf(err) === TikkaSdkErrorCode.UserRejected) {
    return { code: "USER_REJECTED", message: "Transaction was rejected by the user." };
  }
  return { code: "SIGNING_FAILED", message: messageOf(err), cause: err };
}

/** SUBMIT-stage classifier. */
function submitError(err: unknown): PipelineError {
  return { code: "SUBMISSION_FAILED", message: messageOf(err), cause: err };
}

/** POLL-stage classifier. */
function pollError(err: unknown, txHash: string): PipelineError {
  if (codeOf(err) === TikkaSdkErrorCode.Timeout) {
    return { code: "TIMEOUT", message: messageOf(err), txHash };
  }
  return { code: "FINALITY_FAILED", message: messageOf(err), txHash };
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full BUILD → ESTIMATE → SIGN → SUBMIT → POLL pipeline by driving the
 * SDK `ContractService` stage methods.
 *
 * Stage sequence (BUILD is a UI-compat no-op since the SDK builds+simulates
 * atomically):
 * 1. **ESTIMATE**  — `target.simulate(method, params)` returns the assembled XDR,
 *    resource fee, and network passphrase
 * 2. **SIGN**      — `target.sign(assembledXdr, networkPassphrase)` via the SDK wallet
 * 3. **SUBMIT**    — `target.submit(signedXdr)` broadcasts and returns the tx hash
 * 4. **POLL**      — `target.poll(txHash, config)` waits for ledger finality
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
 * @param input Pipeline input carrying the SDK stage methods, contract method, params, and options
 * @returns     `{ ok: true, data: PipelineSuccess }` or `{ ok: false, error: PipelineError }`
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  try {
    return await _runPipeline(input);
  } catch (err) {
    // Safety net: runPipeline must never throw under any circumstances.
    return { ok: false, error: { code: "BUILD_FAILED", message: "Unexpected pipeline error.", cause: err } };
  }
}

async function _runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { target, method, params, options = {} } = input;
  const { onProgress, pollTimeoutMs = 30_000, pollIntervalMs = 2_000 } = options;

  // ── 1. BUILD (UI-compat no-op) ─────────────────────────────────────────────
  emit(onProgress, { stage: "BUILD", status: "pending" });
  emit(onProgress, { stage: "BUILD", status: "done" });

  // ── 2. ESTIMATE ────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "ESTIMATE", status: "pending" });
  let sim: SimulateResult;
  let estimatedFee: string | undefined;
  try {
    sim = await target.simulate(method, params);
    // feeOverride only affects what we *report* — the SDK negotiates the real fee.
    estimatedFee = options.feeOverride ?? sim.minResourceFee;
  } catch (err) {
    emit(onProgress, { stage: "ESTIMATE", status: "error" });
    return { ok: false, error: estimateError(err) };
  }
  emit(onProgress, { stage: "ESTIMATE", status: "done", estimatedFee });

  // ── 3. SIGN ────────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "SIGN", status: "pending" });
  let signedXdr: string;
  try {
    signedXdr = await target.sign(sim.assembledXdr, sim.networkPassphrase);
  } catch (err) {
    emit(onProgress, { stage: "SIGN", status: "error" });
    return { ok: false, error: signError(err) };
  }
  emit(onProgress, { stage: "SIGN", status: "done" });

  // ── 4. SUBMIT ──────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "SUBMIT", status: "pending" });
  let txHash: string;
  try {
    txHash = await target.submit(signedXdr);
  } catch (err) {
    emit(onProgress, { stage: "SUBMIT", status: "error" });
    return { ok: false, error: submitError(err) };
  }
  emit(onProgress, { stage: "SUBMIT", status: "done", txHash });

  // ── 5. POLL ────────────────────────────────────────────────────────────────
  emit(onProgress, { stage: "POLL", status: "pending" });
  let polled: SubmitResult;
  try {
    const pollConfig: PollConfig = { timeoutMs: pollTimeoutMs, intervalMs: pollIntervalMs };
    polled = await target.poll(txHash, pollConfig);
  } catch (err) {
    emit(onProgress, { stage: "POLL", status: "error" });
    return { ok: false, error: pollError(err, txHash) };
  }
  emit(onProgress, { stage: "POLL", status: "done", confirmations: 1 });

  // ── 6. DONE ────────────────────────────────────────────────────────────────
  const finalHash = polled.txHash ?? txHash;
  emit(onProgress, { stage: "DONE", status: "done", txHash: finalHash });
  return { ok: true, data: { txHash: finalHash, confirmedAt: polled.ledger } };
}