/**
 * Oracle cost estimator — fee accuracy harness (#1330)
 *
 * The oracle books every PRNG/VRF reveal at the fee it *believes* it paid
 * (`FeeStrategyService.recordRevealCost`). This suite pins the contract that
 * makes those books auditable, using the same `@tikka/fee-accuracy` harness
 * the SDK and the scheduled testnet run share:
 *
 *   quoted (FeeEstimate.cappedFee)  vs  charged (fee read from the confirmed
 *   transaction)  →  must land inside the enforced tolerance band.
 *
 * Three regressions are locked in here:
 *
 * 1. a confirmed transaction always reports a positive charge, and a `feePaid`
 *    that is absent or zero is `invalid` — never a pass. A hardcoded
 *    `feePaid: 0` used to make every reveal look free;
 * 2. booking a flat `BASE_FEE * feeBump` instead of the real charge (the old
 *    fallback) is provably under-reporting, and the harness says so;
 * 3. when inclusion fees surge, the estimator's quote has to follow them, and
 *    the wider surge band is what keeps a legitimately higher charge from
 *    failing the run.
 *
 * Note: `SubmissionService` is not imported here on purpose — it pulls in
 * `tx-submitter.service.ts`, which currently fails `tsc` (pre-existing), and the
 * oracle jest config cannot load the Stellar SDK CJS build under the pnpm store
 * layout. The fee extraction it relies on is
 * `SubmissionService.extractFeePaid` → `extractFeeChargedStroops`, exercised
 * here directly against the payload shapes Soroban RPC returns.
 */

import {
  DEFAULT_FEE_ACCURACY_CONFIG,
  detectSurge,
  evaluateFeeAccuracy,
  extractFeeChargedStroops,
  resolveFeeAccuracyConfig,
  type FeeObservation,
} from '@tikka/fee-accuracy';

/** Mirrors `FeeEstimate` from `src/submitter/fee-estimator.service.ts`. */
interface FeeEstimateLike {
  baseFee: number;
  priorityFee: number;
  totalFee: number;
  cappedFee: number;
  isCapped: boolean;
}

const CALM_STATS = {
  latestLedger: 5000,
  sorobanInclusionFee: { min: '100', mode: '100', p50: '100', p95: '100', max: '100' },
};

const SURGED_STATS = {
  latestLedger: 5000,
  sorobanInclusionFee: {
    min: '250000',
    mode: '400000',
    p50: '380000',
    p95: '450000',
    max: '600000',
  },
};

/** Fee quoted for a reveal on a calm ledger (p95 inclusion fee). */
const CALM_QUOTE = 50_100;

/** Fee quoted once inclusion fees surge, including the transaction footprint. */
const SURGED_QUOTE = 400_100;

/** The old hardcoded accounting value: one base fee per fee bump. */
const FLAT_BASE_FEE = 100;

function observationFor(
  label: string,
  estimate: FeeEstimateLike,
  chargedStroops: number | undefined,
  surge: boolean,
  transactionHash: string,
): FeeObservation {
  return {
    label,
    estimatedStroops: estimate.cappedFee,
    actualStroops: chargedStroops,
    surge,
    details: {
      priorityFee: estimate.priorityFee,
      isCapped: estimate.isCapped,
      transactionHash,
    },
  };
}

describe('oracle reveal cost — accurate accounting', () => {
  const config = resolveFeeAccuracyConfig();

  it('reads the charged fee out of a confirmed Soroban transaction', () => {
    // `resultXdr` is how Soroban RPC reports the result; `feeCharged()` returns
    // an `xdr.Int64`.
    const resultXdr = { feeCharged: () => ({ toString: () => '50100' }) };
    expect(extractFeeChargedStroops({ status: 'SUCCESS', resultXdr })).toBe(CALM_QUOTE);

    // JSON shapes used by RPC and Horizon respectively.
    expect(extractFeeChargedStroops({ status: 'SUCCESS', feeCharged: '50100' })).toBe(CALM_QUOTE);
    expect(extractFeeChargedStroops({ status: 'SUCCESS', fee_charged: 50100 })).toBe(CALM_QUOTE);
  });

  it('books a reveal at the fee the network charged', () => {
    const estimate: FeeEstimateLike = {
      baseFee: 100,
      priorityFee: CALM_QUOTE,
      totalFee: CALM_QUOTE,
      cappedFee: CALM_QUOTE,
      isCapped: false,
    };
    const surge = detectSurge(CALM_STATS, config.surgeThresholdStroops);

    const report = evaluateFeeAccuracy(
      [
        observationFor(
          'oracle.prng_reveal',
          estimate,
          extractFeeChargedStroops({
            resultXdr: { feeCharged: () => ({ toString: () => String(CALM_QUOTE) }) },
          }),
          surge.surging,
          'tx-hash-calm',
        ),
      ],
      config,
    );

    expect(surge.surging).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });
});

describe('oracle reveal cost — regressions the harness must catch', () => {
  const config = DEFAULT_FEE_ACCURACY_CONFIG;

  it('never treats a hardcoded feePaid of 0 as a real charge', () => {
    const report = evaluateFeeAccuracy(
      [
        {
          label: 'oracle.prng_reveal',
          estimatedStroops: CALM_QUOTE,
          // What the submitter used to report for every confirmed reveal.
          actualStroops: 0,
        },
      ],
      config,
    );

    expect(report.passed).toBe(false);
    expect(report.failures[0].verdict).toBe('invalid');
    expect(report.failures[0].reason).toContain('hardcoded feePaid');
  });

  it('rejects a booked cost far below the fee the network charged', () => {
    const estimate: FeeEstimateLike = {
      baseFee: 100,
      priorityFee: CALM_QUOTE,
      totalFee: CALM_QUOTE,
      cappedFee: CALM_QUOTE,
      isCapped: false,
    };

    const report = evaluateFeeAccuracy(
      [
        observationFor(
          'oracle.prng_reveal',
          estimate,
          // The network charged the quote, but the old fallback booked
          // BASE_FEE * feeBump = 100 stroops.
          FLAT_BASE_FEE,
          false,
          'tx-hash-flat',
        ),
      ],
      config,
    );

    expect(report.passed).toBe(false);
    expect(report.failures[0].verdict).toBe('over-quoted');
    expect(report.failures[0].deltaStroops).toBe(-(CALM_QUOTE - FLAT_BASE_FEE));
  });

  it('requires the estimate to follow a surge in inclusion fees', () => {
    const surge = detectSurge(SURGED_STATS, DEFAULT_FEE_ACCURACY_CONFIG.surgeThresholdStroops);
    expect(surge.surging).toBe(true);

    const stale: FeeEstimateLike = {
      baseFee: 100,
      priorityFee: CALM_QUOTE,
      totalFee: CALM_QUOTE,
      cappedFee: CALM_QUOTE,
      isCapped: false,
    };
    const surged: FeeEstimateLike = {
      baseFee: 100,
      priorityFee: SURGED_QUOTE,
      totalFee: SURGED_QUOTE,
      cappedFee: SURGED_QUOTE,
      isCapped: false,
    };

    const staleReport = evaluateFeeAccuracy(
      [
        observationFor(
          'oracle.prng_reveal',
          stale,
          SURGED_QUOTE,
          surge.surging,
          'tx-hash-surge-stale',
        ),
      ],
      config,
    );
    const surgedReport = evaluateFeeAccuracy(
      [observationFor('oracle.prng_reveal', surged, SURGED_QUOTE, surge.surging, 'tx-hash-surge')],
      config,
    );

    expect(staleReport.passed).toBe(false);
    expect(staleReport.surgeDetected).toBe(true);
    expect(surgedReport.passed).toBe(true);
    expect(surgedReport.surgeDetected).toBe(true);
  });

  it('honours a tightened tolerance configured for the scheduled run', () => {
    const observation: FeeObservation = {
      label: 'oracle.prng_reveal',
      estimatedStroops: CALM_QUOTE,
      actualStroops: CALM_QUOTE + 2_000,
    };

    const relaxed = resolveFeeAccuracyConfig({ TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT: '25' });
    const strict = resolveFeeAccuracyConfig({
      TIKKA_FEE_ACCURACY_TOLERANCE_PERCENT: '1',
      TIKKA_FEE_ACCURACY_TOLERANCE_STROOPS: '500',
    });

    expect(evaluateFeeAccuracy([observation], relaxed).passed).toBe(true);
    expect(evaluateFeeAccuracy([observation], strict).passed).toBe(false);
  });
});
