import { ContractFnName } from '../contract/bindings';

// ─── Fee Quote API ────────────────────────────────────────────────────────────

/**
 * How the fee estimate was derived.
 * - `simulation` — live `simulateTransaction` RPC call (most accurate)
 * - `fallback`   — static heuristic used when simulation is unavailable
 */
export type FeeQuoteSource = 'simulation' | 'fallback';

/**
 * Confidence level of the fee estimate.
 * - `high`   — live simulation succeeded; safe to present to the user
 * - `medium` — simulation data is stale (past `staleAfterMs`) but usable
 * - `low`    — fallback estimate; actual fee may differ significantly
 */
export type FeeQuoteConfidence = 'high' | 'medium' | 'low';

/**
 * User-visible warnings attached to a fee quote.
 * Consumers should surface at least the `message` in their UI.
 */
export interface FeeQuoteWarning {
  /** Machine-readable code for programmatic handling */
  code: 'STALE_QUOTE' | 'FALLBACK_ESTIMATE' | 'MAX_FEE_EXCEEDED' | 'SIMULATION_ERROR';
  /** Human-readable explanation */
  message: string;
}

/**
 * A reusable, typed fee quote returned by `FeeEstimatorService.getFeeQuote()`.
 *
 * Carries everything a signing flow needs:
 * - The estimated amounts (`xlm`, `stroops`)
 * - Where the estimate came from (`source`)
 * - How reliable it is (`confidence`)
 * - When it expires (`expiresAt`) — re-fetch if `Date.now() > expiresAt`
 * - Any caveats the UI should surface (`warnings`)
 * - The full resource breakdown for power-user UIs (`resources`)
 */
export interface FeeQuote {
  /** Estimated total fee in human-readable XLM (7 decimal places) */
  xlm: string;
  /** Estimated total fee in stroops (string to avoid overflow) */
  stroops: string;
  /** Timestamp (ms since epoch) when this quote should be considered stale */
  expiresAt: number;
  /** How the estimate was derived */
  source: FeeQuoteSource;
  /** Reliability of this estimate */
  confidence: FeeQuoteConfidence;
  /** Warnings the UI should surface (empty when confidence is high) */
  warnings: FeeQuoteWarning[];
  /** Detailed per-component resource breakdown */
  resources: FeeResourceBreakdown;
}

/** Options accepted by `FeeEstimatorService.getFeeQuote()`. */
export interface GetFeeQuoteParams extends EstimateFeeParams {
  /**
   * Hard ceiling in stroops. If the estimated fee exceeds this value a
   * `MAX_FEE_EXCEEDED` warning is added and confidence is downgraded to `low`.
   */
  maxFeeStroops?: string;
  /**
   * How long (ms) a simulation-derived quote remains `high`-confidence.
   * Defaults to 30 000 ms (30 s).
   */
  staleAfterMs?: number;
}

/**
 * Detailed breakdown of the fee components returned by `estimateFee()`.
 *
 * Stellar Soroban fees have two top-level components:
 *  - **base fee** — the minimum protocol fee every transaction pays (100 stroops by default)
 *  - **resource fee** — the extra charge for Soroban resource consumption (CPU, memory, ledger I/O)
 *
 * The `cpuInstructions`, `diskReadBytes`, `writeBytes`, and ledger entry counts are raw
 * *consumption* metrics extracted from `transactionData.resources()`; they let UIs show
 * human-readable resource breakdowns before the user signs.
 */
export interface FeeResourceBreakdown {
  /**
   * Fixed minimum transaction fee paid to validators regardless of contract execution.
   * Protocol default: 100 stroops.
   */
  baseFeeStroops: string;

  /**
   * Total resource fee charged for Soroban execution (CPU + memory + ledger I/O + bandwidth).
   * Sourced directly from `simulateTransaction` → `minResourceFee`.
   */
  resourceFeeStroops: string;

  /**
   * CPU instructions consumed by the contract invocation.
   * Sourced from `sim.transactionData.resources().instructions()`.
   */
  cpuInstructions: number;

  /**
   * Bytes read from disk (state) during the invocation.
   * Sourced from `sim.transactionData.resources().diskReadBytes()`.
   */
  diskReadBytes: number;

  /**
   * Bytes written to disk (state) during the invocation.
   * Sourced from `sim.transactionData.resources().writeBytes()`.
   */
  writeBytes: number;

  /**
   * Number of read-only ledger entries accessed in the invocation footprint.
   * Sourced from `sim.transactionData.resources().footprint().readOnly().length`.
   */
  readOnlyEntries: number;

  /**
   * Number of read-write ledger entries accessed in the invocation footprint.
   * Sourced from `sim.transactionData.resources().footprint().readWrite().length`.
   */
  readWriteEntries: number;
}

/**
 * Full result returned by `FeeEstimatorService.estimateFee()`.
 */
export interface FeeEstimateResult {
  /**
   * Total estimated fee in human-readable XLM (7 decimal places).
   * Equal to `(baseFee + resourceFee)` converted from stroops.
   */
  xlm: string;

  /**
   * Total estimated fee in stroops (as a string to avoid integer overflow).
   * Equal to `baseFeeStroops + resourceFeeStroops`.
   */
  stroops: string;

  /** Detailed per-component breakdown. */
  resources: FeeResourceBreakdown;
}

/**
 * Input parameters for `FeeEstimatorService.estimateFee()`.
 */
export interface EstimateFeeParams {
  /**
   * Name of the contract function to invoke (e.g. `ContractFn.BUY_TICKET`).
   * Accepts any string so callers can pass raw function names.
   */
  method: ContractFnName | string;

  /**
   * Arguments to pass to the contract function.
   * Accepts the same types as `ContractService.invoke` — raw JS values,
   * `xdr.ScVal` instances, or Stellar public keys (56-char G-strings).
   */
  params: any[];

  /**
   * Optional Stellar public key to use as the transaction source.
   * When omitted the connected wallet's public key is used, and if no
   * wallet is set a well-known zero-balance key is substituted so the
   * simulation still runs (read-path estimation).
   */
  sourcePublicKey?: string;
}
