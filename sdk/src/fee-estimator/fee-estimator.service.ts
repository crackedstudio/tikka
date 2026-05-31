import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  BASE_FEE,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { WalletAdapter } from '../wallet/wallet.interface';
import { getRaffleContractId } from '../contract/constants';
import { stroopsToXlm } from '../utils/formatting';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import {
  EstimateFeeParams,
  FeeEstimateResult,
  FeeResourceBreakdown,
  FeeQuote,
  FeeQuoteWarning,
  GetFeeQuoteParams,
} from './fee-estimator.types';

/** Default TTL for a simulation-derived fee quote (30 s). */
const DEFAULT_STALE_AFTER_MS = 30_000;

/**
 * Fallback base estimate used when simulation is unavailable.
 * Covers a typical Soroban invocation with moderate resource usage.
 * 100 (base) + 50 000 (resource) = 50 100 stroops ≈ 0.0050100 XLM.
 */
const FALLBACK_RESOURCE_FEE_STROOPS = '50000';

/**
 * Stellar protocol minimum base fee (100 stroops).
 * Matches `BASE_FEE` from `@stellar/stellar-sdk`.
 */
const BASE_FEE_STROOPS = Number(BASE_FEE);

/**
 * Anonymous zero-balance Stellar account used when no wallet is connected.
 * Allows fee estimation for read-only / UI preview paths without a real account.
 */
const ANONYMOUS_SOURCE_KEY =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * FeeEstimatorService
 *
 * Estimates the XLM cost of invoking a Tikka contract function **before** the
 * user is asked to sign anything. It uses `simulateTransaction` (a read-only
 * Soroban RPC call) and parses the returned fee fields.
 *
 * ## Fee model
 *
 * Every Soroban transaction pays two fee components:
 *
 * | Component        | Description                                               |
 * |------------------|-----------------------------------------------------------|
 * | **Base fee**     | Fixed 100-stroop validator tip; always charged            |
 * | **Resource fee** | Variable: CPU instructions + memory + ledger I/O + size  |
 *
 * `totalFee = baseFee + minResourceFee`
 *
 * All amounts are surfaced both as raw stroops strings and as human-readable
 * 7-decimal XLM strings.
 *
 * ## Usage
 *
 * ```ts
 * const estimate = await feeEstimator.estimateFee({
 *   method: ContractFn.BUY_TICKET,
 *   params: [raffleId, buyerPublicKey, quantity],
 * });
 *
 * console.log(`Estimated fee: ${estimate.xlm} XLM`);
 * console.log(`CPU instructions: ${estimate.resources.cpuInstructions}`);
 * ```
 *
 * Re-call `estimateFee` with updated params whenever user inputs change —
 * the estimate refreshes because it re-runs `simulateTransaction`.
 */
@Injectable()
export class FeeEstimatorService {
  private contractId: string;

  constructor(
    private readonly rpcService: RpcService,
    private readonly horizon: HorizonService,
    @Inject('NETWORK_CONFIG') private readonly networkConfig: NetworkConfig,
    @Optional() @Inject('WALLET_ADAPTER') private readonly wallet?: WalletAdapter,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
  }

  /**
   * Override the contract ID used for fee estimation.
   * Useful in tests or when targeting a non-default contract deployment.
   */
  setContractId(id: string): void {
    this.contractId = id;
  }

  /**
   * Estimates the transaction fee for a contract invocation.
   *
   * Runs `simulateTransaction` against the Soroban RPC and parses:
   * - `minResourceFee` — total resource charge in stroops
   * - `cost.cpuInstructions` — CPU consumption
   * - `cost.memBytes` — memory consumption
   * - `stateChanges` — ledger entry read/write count
   *
   * @param params - Method name, contract arguments, and optional source key.
   * @returns `FeeEstimateResult` with `xlm`, `stroops`, and `resources` breakdown.
   * @throws `TikkaSdkError` with `SimulationFailed` if the simulation errors.
   */
  async estimateFee(params: EstimateFeeParams): Promise<FeeEstimateResult> {
    const sourceKey = await this.resolveSourceKey(params.sourcePublicKey);

    const tx = await this.buildTransaction(params.method, params.params, sourceKey);

    const simResponse = await this.rpcService.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? 'unknown error';
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Fee estimation simulation failed for "${params.method}": ${errMsg}`,
      );
    }

    const successSim = simResponse as rpc.Api.SimulateTransactionSuccessResponse;

    return this.parseFeeResult(successSim);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async resolveSourceKey(override?: string): Promise<string> {
    if (override) return override;
    if (this.wallet) {
      try {
        return await this.wallet.getPublicKey();
      } catch {
        // Fall through to anonymous key if wallet lookup fails
      }
    }
    return ANONYMOUS_SOURCE_KEY;
  }

  private async buildTransaction(
    method: string,
    params: any[],
    sourceKey: string,
  ) {
    const account = await this.horizon.loadAccount(sourceKey).catch(() => ({
      accountId: () => sourceKey,
      sequenceNumber: () => '0',
    } as any));

    const contract = new Contract(this.contractId);
    return new TransactionBuilder(account, {
      fee: String(BASE_FEE_STROOPS),
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(method, ...params.map((p) => this.toScVal(p))),
      )
      .setTimeout(30)
      .build();
  }

  private parseFeeResult(
    sim: rpc.Api.SimulateTransactionSuccessResponse,
  ): FeeEstimateResult {
    const resourceFeeStroops = String(sim.minResourceFee ?? '0');

    // Extract per-resource consumption from the Soroban resource footprint.
    // `transactionData.resources()` returns an xdr.SorobanResources instance.
    let cpuInstructions = 0;
    let diskReadBytes = 0;
    let writeBytes = 0;
    let readOnlyEntries = 0;
    let readWriteEntries = 0;

    try {
      // `transactionData` is a SorobanDataBuilder; call .build() to get the
      // underlying xdr.SorobanTransactionData, then read .resources().
      const resources = sim.transactionData.build().resources();
      cpuInstructions = Number(resources.instructions());
      diskReadBytes = Number(resources.diskReadBytes());
      writeBytes = Number(resources.writeBytes());
      readOnlyEntries = resources.footprint().readOnly().length;
      readWriteEntries = resources.footprint().readWrite().length;
    } catch {
      // transactionData may be absent in mocked/test responses; degrade gracefully.
    }

    const totalStroops = new BigNumber(BASE_FEE_STROOPS)
      .plus(resourceFeeStroops)
      .toFixed(0);

    const breakdown: FeeResourceBreakdown = {
      baseFeeStroops: String(BASE_FEE_STROOPS),
      resourceFeeStroops,
      cpuInstructions,
      diskReadBytes,
      writeBytes,
      readOnlyEntries,
      readWriteEntries,
    };

    return {
      xlm: stroopsToXlm(totalStroops),
      stroops: totalStroops,
      resources: breakdown,
    };
  }

  private toScVal(val: any): xdr.ScVal {
    if (val instanceof xdr.ScVal) return val;
    if (typeof val === 'string' && val.length === 56) {
      return new Address(val).toScVal();
    }
    return nativeToScVal(val);
  }

  // ─── Fee Quote API ──────────────────────────────────────────────────────────

  /**
   * Returns a reusable, typed `FeeQuote` that includes source, confidence,
   * expiry, and any user-visible warnings.
   *
   * Behaviour:
   * - Attempts a live `simulateTransaction` (source = `simulation`, confidence = `high`)
   * - On simulation failure falls back to a static heuristic (source = `fallback`,
   *   confidence = `low`) so the caller always receives a usable estimate.
   * - Adds `MAX_FEE_EXCEEDED` warning when the estimate exceeds `maxFeeStroops`.
   *
   * @example
   * ```ts
   * const quote = await feeEstimator.getFeeQuote({
   *   method: ContractFn.BUY_TICKET,
   *   params: [raffleId, buyerKey, quantity],
   *   maxFeeStroops: '100000',
   * });
   * if (quote.warnings.length) console.warn(quote.warnings.map(w => w.message));
   * // Pass quote.stroops as the fee ceiling when building the real transaction.
   * await wallet.signTransaction(tx, { fee: quote.stroops });
   * ```
   */
  async getFeeQuote(params: GetFeeQuoteParams): Promise<FeeQuote> {
    const staleAfterMs = params.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    const warnings: FeeQuoteWarning[] = [];

    let estimate: FeeEstimateResult;
    let source: FeeQuote['source'];
    let confidence: FeeQuote['confidence'];

    try {
      estimate = await this.estimateFee(params);
      source = 'simulation';
      confidence = 'high';
    } catch {
      // Simulation failed — build a fallback quote from static heuristics.
      const fallbackStroops = (
        BigInt(BASE_FEE_STROOPS) + BigInt(FALLBACK_RESOURCE_FEE_STROOPS)
      ).toString();

      const fallbackResources: FeeResourceBreakdown = {
        baseFeeStroops: String(BASE_FEE_STROOPS),
        resourceFeeStroops: FALLBACK_RESOURCE_FEE_STROOPS,
        cpuInstructions: 0,
        diskReadBytes: 0,
        writeBytes: 0,
        readOnlyEntries: 0,
        readWriteEntries: 0,
      };

      estimate = {
        xlm: stroopsToXlm(fallbackStroops),
        stroops: fallbackStroops,
        resources: fallbackResources,
      };
      source = 'fallback';
      confidence = 'low';
      warnings.push({
        code: 'FALLBACK_ESTIMATE',
        message:
          'Fee simulation failed — showing a static fallback estimate. ' +
          'The actual fee may differ.',
      });
    }

    // Max-fee guard
    if (
      params.maxFeeStroops !== undefined &&
      BigInt(estimate.stroops) > BigInt(params.maxFeeStroops)
    ) {
      confidence = 'low';
      warnings.push({
        code: 'MAX_FEE_EXCEEDED',
        message:
          `Estimated fee (${estimate.stroops} stroops) exceeds your configured ` +
          `maximum of ${params.maxFeeStroops} stroops. Review before signing.`,
      });
    }

    return {
      xlm: estimate.xlm,
      stroops: estimate.stroops,
      expiresAt: Date.now() + staleAfterMs,
      source,
      confidence,
      warnings,
      resources: estimate.resources,
    };
  }

  /**
   * Returns whether a previously obtained `FeeQuote` is still within its
   * validity window.
   *
   * @param quote  - The quote to check.
   * @param nowMs  - Override for the current time (defaults to `Date.now()`).
   */
  isQuoteStale(quote: FeeQuote, nowMs = Date.now()): boolean {
    return nowMs >= quote.expiresAt;
  }
}
