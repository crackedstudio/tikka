/**
 * Fee estimate accuracy — estimator behaviour under calm and surged networks.
 *
 * The live counterpart (`src/test/integration/fee-estimate-accuracy.spec.ts`)
 * measures the same thing against testnet, where the fee the network charges
 * is read back from the on-chain result. This suite pins the behaviour that
 * measurement relies on, without a network:
 *
 * - a simulation-derived quote tracks the resource fee the network is charging,
 *   including when Soroban inclusion fees surge;
 * - the shared `@tikka/fee-accuracy` harness accepts a quote/charge pair that
 *   stayed inside the tolerance band, and rejects the pairs that drifted —
 *   including the stale static fallback, which is the estimate a surge makes
 *   dangerous.
 */

import {
  compareFeeObservation,
  DEFAULT_FEE_ACCURACY_CONFIG,
  detectSurge,
  evaluateFeeAccuracy,
  minimumInclusionFeeStroops,
  resolveFeeAccuracyConfig,
  type FeeObservation,
} from '@tikka/fee-accuracy';
import { BASE_FEE } from '@stellar/stellar-sdk';
import { FeeEstimatorService } from './fee-estimator.service';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const BASE_FEE_STROOPS = Number(BASE_FEE);

/** Resource fee a calm testnet ledger charges for a raffle contract call. */
const CALM_MIN_RESOURCE_FEE_STROOPS = 50_000;

/** Resource fee once inclusion fees surge — the same call, ~10x the footprint. */
const SURGED_MIN_RESOURCE_FEE_STROOPS = 400_000;

const CALM_INCLUSION_FEE_STATS = {
  latestLedger: 1000,
  sorobanInclusionFee: {
    min: '100',
    mode: '100',
    p50: '100',
    p95: '100',
    max: '100',
  },
};

const SURGED_INCLUSION_FEE_STATS = {
  latestLedger: 1000,
  sorobanInclusionFee: {
    min: '250000',
    mode: '400000',
    p50: '380000',
    p95: '450000',
    max: '600000',
  },
};

function makeMockAccount(publicKey: string) {
  let sequence = 0n;
  return {
    accountId: () => publicKey,
    sequenceNumber: () => sequence.toString(),
    incrementSequenceNumber: () => {
      sequence += 1n;
    },
  };
}

function makeSuccessResponse(minResourceFee: string) {
  return {
    minResourceFee,
    transactionData: {
      build: () => ({
        resources: () => ({
          instructions: () => 1_234,
          diskReadBytes: () => 0,
          writeBytes: () => 0,
          footprint: () => ({ readOnly: () => [{}], readWrite: () => [{}] }),
        }),
      }),
    },
    latestLedger: 1000,
    _parsed: true,
  };
}

/** Builds a `FeeEstimatorService` whose RPC returns `minResourceFee` verbatim. */
function buildService(minResourceFee: string): FeeEstimatorService {
  const rpcService = {
    simulateTransaction: jest.fn().mockResolvedValue(makeSuccessResponse(minResourceFee)),
  } as unknown as RpcService;

  const horizonService = {
    loadAccount: jest.fn((key: string) => Promise.resolve(makeMockAccount(key))),
  } as unknown as HorizonService;

  const networkConfig: NetworkConfig = {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const service = new FeeEstimatorService(rpcService, horizonService, networkConfig);
  service.setContractId(TEST_CONTRACT_ID);
  return service;
}

const ESTIMATE_PARAMS = { method: 'buy_ticket', params: [1] };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeeEstimatorService — accuracy under calm network conditions', () => {
  it('quotes the fee the network charges for the same call', async () => {
    const service = buildService(String(CALM_MIN_RESOURCE_FEE_STROOPS));

    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    expect(quote.source).toBe('simulation');
    expect(quote.confidence).toBe('high');
    expect(quote.warnings).toHaveLength(0);
    expect(quote.stroops).toBe(String(BASE_FEE_STROOPS + CALM_MIN_RESOURCE_FEE_STROOPS));

    // The charge the network applies to a transaction carrying exactly this
    // fee: base fee + the resource fee the simulation reported.
    const comparison = compareFeeObservation(
      {
        label: 'sdk.buy_ticket',
        estimatedStroops: quote.stroops,
        actualStroops: BASE_FEE_STROOPS + CALM_MIN_RESOURCE_FEE_STROOPS,
        surge: detectSurge(
          CALM_INCLUSION_FEE_STATS,
          DEFAULT_FEE_ACCURACY_CONFIG.surgeThresholdStroops,
        ).surging,
      },
      DEFAULT_FEE_ACCURACY_CONFIG,
    );

    expect(comparison.verdict).toBe('accurate');
    expect(comparison.passed).toBe(true);
  });

  it('tolerates the network charging a little more than quoted', async () => {
    const service = buildService(String(CALM_MIN_RESOURCE_FEE_STROOPS));
    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    const report = evaluateFeeAccuracy(
      [
        {
          label: 'sdk.buy_ticket',
          estimatedStroops: quote.stroops,
          // 4% of drift — within the normal band, must not fail a run.
          actualStroops: BASE_FEE_STROOPS + CALM_MIN_RESOURCE_FEE_STROOPS + 2_000,
        },
      ],
      DEFAULT_FEE_ACCURACY_CONFIG,
    );

    expect(report.passed).toBe(true);
    expect(report.surgeDetected).toBe(false);
  });
});

describe('FeeEstimatorService — accuracy under surge conditions', () => {
  const surge = detectSurge(
    SURGED_INCLUSION_FEE_STATS,
    DEFAULT_FEE_ACCURACY_CONFIG.surgeThresholdStroops,
  );

  it('classifies the surged network as surged', () => {
    expect(surge.surging).toBe(true);
    expect(surge.inclusionFeeStroops).toBe(400_000);
  });

  it('raises the quote with the surged resource fee instead of reusing a stale estimate', async () => {
    const service = buildService(String(SURGED_MIN_RESOURCE_FEE_STROOPS));

    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    expect(quote.source).toBe('simulation');
    expect(quote.stroops).toBe(String(BASE_FEE_STROOPS + SURGED_MIN_RESOURCE_FEE_STROOPS));
    expect(Number(quote.stroops)).toBeGreaterThan(BASE_FEE_STROOPS + CALM_MIN_RESOURCE_FEE_STROOPS);
  });

  it('quotes at or above the inclusion fee the network currently demands', async () => {
    const service = buildService(String(SURGED_MIN_RESOURCE_FEE_STROOPS));
    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    const demanded = minimumInclusionFeeStroops(surge.minInclusionFeeStroops);

    // A quote below this would be rejected with tx_insufficient_fee instead of
    // being charged — the failure mode a surge causes.
    expect(Number(quote.stroops)).toBeGreaterThanOrEqual(demanded);
  });

  it('keeps the surged quote inside the surge tolerance band', async () => {
    const service = buildService(String(SURGED_MIN_RESOURCE_FEE_STROOPS));
    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    const report = evaluateFeeAccuracy(
      [
        {
          label: 'sdk.buy_ticket',
          estimatedStroops: quote.stroops,
          actualStroops: BASE_FEE_STROOPS + SURGED_MIN_RESOURCE_FEE_STROOPS,
          surge: surge.surging,
        },
      ],
      DEFAULT_FEE_ACCURACY_CONFIG,
    );

    expect(report.passed).toBe(true);
    expect(report.surgeDetected).toBe(true);
  });

  it('flags the static fallback estimate as under-quoting once fees surge', async () => {
    // Simulation unavailable → the estimator falls back to a static heuristic.
    const service = buildService('0');
    (service['rpcService'].simulateTransaction as jest.Mock).mockRejectedValue(
      new Error('rpc unavailable'),
    );

    const quote = await service.getFeeQuote(ESTIMATE_PARAMS);

    expect(quote.source).toBe('fallback');
    expect(quote.warnings.map((warning) => warning.code)).toContain('FALLBACK_ESTIMATE');

    const report = evaluateFeeAccuracy(
      [
        {
          label: 'sdk.buy_ticket',
          estimatedStroops: quote.stroops,
          actualStroops: BASE_FEE_STROOPS + SURGED_MIN_RESOURCE_FEE_STROOPS,
          surge: surge.surging,
        },
      ],
      DEFAULT_FEE_ACCURACY_CONFIG,
    );

    expect(report.passed).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].verdict).toBe('under-quoted');
    expect(report.failures[0].reason).toContain('rejected under load');
  });
});

describe('SDK fee accuracy — tolerance configuration', () => {
  it('reads the tolerance the scheduled run enforces from the environment', () => {
    const observation: FeeObservation = {
      label: 'sdk.buy_ticket',
      estimatedStroops: 50_100,
      actualStroops: 55_000,
    };

    const strict = resolveFeeAccuracyConfig({ TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT: '1' });
    const relaxed = resolveFeeAccuracyConfig({ TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT: '50' });

    expect(compareFeeObservation(observation, strict).passed).toBe(false);
    expect(compareFeeObservation(observation, relaxed).passed).toBe(true);
  });
});
