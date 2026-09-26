/**
 * Opt-in Testnet Fee Accuracy Suite (#1330)
 *
 * Measures how close the SDK's fee estimate is to what the network actually
 * charges, on real testnet, and fails the run when the drift leaves the
 * enforced tolerance band.
 *
 * For every measured write the suite:
 *   1. quotes the fee for the exact contract call via `FeeEstimatorService`,
 *   2. submits that same call with the quoted fee as the envelope base fee,
 *   3. reads the fee the network charged back out of the on-chain result
 *      (`resultXdr.feeCharged()` / RPC `feeCharged`),
 *   4. compares the two through `@tikka/fee-accuracy` and records an
 *      observation.
 *
 * Surge handling: testnet congestion cannot be forced, so the suite reads the
 * ledger's Soroban inclusion-fee stats for every submission. When they are
 * surged, the observation is flagged so the wider surge band applies, and the
 * quote is asserted to cover the inclusion fee the network demanded — a quote
 * below it is rejected with `tx_insufficient_fee` instead of being charged.
 * The deterministic surge behaviour of the estimator is covered by
 * `src/fee-estimator/fee-accuracy.spec.ts`.
 *
 * Gated on TIKKA_TESTNET_TESTS=1 and TIKKA_FEE_ACCURACY_TESTS=1:
 *   TIKKA_TESTNET_TESTS=1 TIKKA_FEE_ACCURACY_TESTS=1 \
 *     pnpm test -- test/integration/fee-estimate-accuracy
 *   pnpm run test:fee-accuracy
 *
 * Env vars (all optional, defaults documented in `@tikka/fee-accuracy`):
 *   TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT / TIKKA_FEE_ACCURACY_TOLERANCE_STROOPS
 *   TIKKA_FEE_ACCURACY_SURGE_TOLERANCE_PERCENT /
 *   TIKKA_FEE_ACCURACY_SURGE_TOLERANCE_STROOPS / TIKKA_FEE_ACCURACY_SURGE_THRESHOLD_STROOPS
 *   TIKKA_FEE_REPORT_PATH
 */

import 'reflect-metadata';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { RaffleService } from '../../modules/raffle/raffle.service';
import type { RaffleParams } from '../../modules/raffle/raffle.types';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { RpcService } from '../../network/rpc.service';
import { FeeEstimatorService } from '../../fee-estimator/fee-estimator.service';
import {
  WalletAdapter,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from '../../wallet/wallet.interface';
import {
  detectSurge,
  evaluateFeeAccuracy,
  extractFeeChargedStroops,
  minimumInclusionFeeStroops,
  resolveFeeAccuracyConfig,
  stroopsToXlmString,
  writeFeeAccuracyReport,
  type FeeObservation,
} from '@tikka/fee-accuracy';

const TESTNET_ENABLED = process.env.TIKKA_TESTNET_TESTS === '1';
const ACCURACY_ENABLED = process.env.TIKKA_FEE_ACCURACY_TESTS === '1';
const describeAccuracy = TESTNET_ENABLED && ACCURACY_ENABLED ? describe : describe.skip;

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const NET_TIMEOUT_MS = 180_000;
const REPORT_LABEL = 'testnet fee accuracy';

class KeypairWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Custom;

  constructor(
    private readonly keypair: Keypair,
    networkPassphrase?: string,
  ) {
    super({ networkPassphrase: networkPassphrase ?? Networks.TESTNET });
  }

  isAvailable(): boolean {
    return true;
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    const passphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase ?? Networks.TESTNET;
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(this.keypair);
    return { signedXdr: tx.toXDR() };
  }

  override async signMessage(message: string): Promise<string> {
    const signature = this.keypair.sign(Buffer.from(message, 'utf8'));
    return Buffer.from(signature).toString('base64');
  }

  override async getNetwork(): Promise<string | undefined> {
    return this.options.networkPassphrase;
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsGetNetwork: true,
    };
  }
}

async function fundViaFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (!res.ok && res.status !== 400) {
    const body = await res.text().catch(() => '');
    throw new Error(`Friendbot failed (${res.status}): ${body}`);
  }
}

describe('testnet fee accuracy opt-in gate', () => {
  it('is skipped by default unless TIKKA_TESTNET_TESTS=1 and TIKKA_FEE_ACCURACY_TESTS=1', () => {
    const enabled = TESTNET_ENABLED && ACCURACY_ENABLED;
    expect(describeAccuracy).toBe(enabled ? describe : describe.skip);
  });
});

describeAccuracy('Soroban fee estimate accuracy on testnet', () => {
  const config = resolveFeeAccuracyConfig();
  const observations: FeeObservation[] = [];

  let app: any;
  let raffleService: RaffleService;
  let contractService: ContractService;
  let feeEstimator: FeeEstimatorService;
  let rpcService: RpcService;
  let testKeypair: Keypair;
  let raffleId: number | undefined;

  /** Reads the ledger's current Soroban inclusion-fee stats. */
  async function readFeeStats() {
    try {
      return await rpcService.getServer().getFeeStats();
    } catch {
      // Fee stats are advisory: an unavailable endpoint must not skip the run.
      return null;
    }
  }

  /**
   * Quotes `method`, submits it at the quoted fee, and records the fee the
   * network charged against the fee that was quoted.
   */
  async function measure<T>(label: string, method: string, params: unknown[]): Promise<T> {
    const quote = await feeEstimator.getFeeQuote({
      method,
      params,
      sourcePublicKey: testKeypair.publicKey(),
    });

    // A static fallback is not an estimate of this call — measuring it would
    // compare a guess against a real charge and fail for the wrong reason.
    expect(quote.source).toBe('simulation');

    // `assembleTransaction` sets the envelope fee to `baseFee + minResourceFee`,
    // so the base fee to submit has to be the quote *minus* the resource fee it
    // already contains. Submitting `quote.stroops` as the base fee would charge
    // a second resource fee and the measurement would blame the estimator for a
    // mismatch this test introduced.
    const baseFeeStroops = Math.max(
      0,
      Number(quote.stroops) - Number(quote.resources.resourceFeeStroops),
    );
    expect(baseFeeStroops + Number(quote.resources.resourceFeeStroops)).toBe(Number(quote.stroops));

    const surge = detectSurge(await readFeeStats(), config.surgeThresholdStroops);

    const result = await contractService.invoke<T>(method, params, {
      sourcePublicKey: testKeypair.publicKey(),
      feeOverride: baseFeeStroops,
    });

    if (!result.success) {
      throw new Error(`${label} failed: ${String(result.error ?? 'unknown error')}`);
    }
    expect(result.transactionHash).toBeTruthy();

    const onChain = await rpcService.getTransaction(result.transactionHash!);
    const chargedStroops = extractFeeChargedStroops(onChain);

    observations.push({
      label,
      estimatedStroops: quote.stroops,
      actualStroops: chargedStroops,
      surge: surge.surging,
      details: {
        source: quote.source,
        confidence: quote.confidence,
        transactionHash: result.transactionHash!,
        ledger: onChain.latestLedger,
        inclusionFeeStroops: surge.inclusionFeeStroops,
        submittedBaseFeeStroops: baseFeeStroops,
        quotedResourceFeeStroops: Number(quote.resources.resourceFeeStroops),
        quotedXlm: stroopsToXlmString(quote.stroops),
        chargedXlm: stroopsToXlmString(chargedStroops),
      },
    });

    return result.value as T;
  }

  beforeAll(async () => {
    const secretKey = process.env.TIKKA_TESTNET_SECRET_KEY || process.env.TIKKA_SECRET_KEY;
    testKeypair = secretKey ? Keypair.fromSecret(secretKey) : Keypair.random();

    await fundViaFriendbot(testKeypair.publicKey());

    const wallet = new KeypairWalletAdapter(testKeypair, Networks.TESTNET);
    app = await NestFactory.createApplicationContext(
      AppModule.forRoot({ network: 'testnet', wallet }),
      { logger: false },
    );

    raffleService = app.get(RaffleService);
    contractService = app.get(ContractService);
    feeEstimator = app.get(FeeEstimatorService);
    rpcService = app.get(RpcService);

    // The quote and the submission must target the same contract instance.
    const contractId = process.env.TIKKA_CONTRACT_TESTNET;
    if (contractId) {
      contractService.setContractId(contractId);
      feeEstimator.setContractId(contractId);
    }
  }, NET_TIMEOUT_MS);

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    // Always leave a report behind, including for a partially failed run, so
    // the scheduled job can publish what was actually measured.
    const report = evaluateFeeAccuracy(observations, config);
    const written = writeFeeAccuracyReport(report);
    process.stdout.write(
      `[${REPORT_LABEL}] ${report.summary}\n` +
        `[${REPORT_LABEL}] JSON: ${written.jsonPath}\n` +
        `[${REPORT_LABEL}] Markdown: ${written.markdownPath}\n`,
    );
  }, NET_TIMEOUT_MS);

  it(
    'quotes and charges the same fee for a raffle write',
    async () => {
      const params: RaffleParams = {
        ticketPrice: '1',
        maxTickets: 10,
        endTime: Date.now() + 24 * 60 * 60 * 1000,
        allowMultiple: true,
        asset: 'XLM',
      };

      raffleId = await measure<number>(
        'sdk.create_raffle',
        ContractFn.CREATE_RAFFLE,
        raffleService.buildCreateContractParams(params),
      );

      expect(typeof raffleId).toBe('number');
    },
    NET_TIMEOUT_MS,
  );

  it(
    'quotes and charges the same fee for a ticket purchase',
    async () => {
      expect(raffleId).toBeDefined();

      await measure('sdk.buy_ticket', ContractFn.BUY_TICKET, [
        raffleId,
        testKeypair.publicKey(),
        1,
      ]);
    },
    NET_TIMEOUT_MS,
  );

  it(
    'never quotes below the inclusion fee the network currently demands',
    async () => {
      // Guards the failure mode a surge causes: an under-quote is not merely
      // inaccurate, the transaction is rejected instead of charged.
      const surge = detectSurge(await readFeeStats(), config.surgeThresholdStroops);
      const demanded = minimumInclusionFeeStroops(surge.minInclusionFeeStroops);

      for (const observation of observations) {
        expect(Number(observation.estimatedStroops)).toBeGreaterThanOrEqual(demanded);
      }
    },
    NET_TIMEOUT_MS,
  );

  it('keeps every observed estimate inside the enforced tolerance', () => {
    const report = evaluateFeeAccuracy(observations, config);

    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      // A real charge is always available, so no observation may be invalid.
      expect(observation.actualStroops as number).toBeGreaterThan(0);
    }
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
