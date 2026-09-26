import {
  allowedDeltaStroops,
  compareFeeObservation,
  DEFAULT_FEE_ACCURACY_CONFIG,
  evaluateFeeAccuracy,
  FEE_ACCURACY_ENV_KEYS,
  resolveFeeAccuracyConfig,
  toReportFile,
  type FeeAccuracyConfig,
} from './compare';

const config: FeeAccuracyConfig = DEFAULT_FEE_ACCURACY_CONFIG;

describe('allowedDeltaStroops', () => {
  it('uses the absolute floor for small estimates', () => {
    expect(allowedDeltaStroops(100, config.normalTolerance)).toBe(2_000);
  });

  it('uses the relative band once it exceeds the floor', () => {
    expect(allowedDeltaStroops(50_100, config.normalTolerance)).toBe(7_515);
  });
});

describe('compareFeeObservation', () => {
  it('passes an exact match', () => {
    const comparison = compareFeeObservation({
      label: 'sdk.buy_ticket',
      estimatedStroops: 50_100,
      actualStroops: 50_100,
    });
    expect(comparison.verdict).toBe('accurate');
    expect(comparison.passed).toBe(true);
    expect(comparison.deltaStroops).toBe(0);
    expect(comparison.deltaPercent).toBe(0);
  });

  it('accepts numeric strings (RPC returns stroops as strings)', () => {
    const comparison = compareFeeObservation({
      label: 'sdk.buy_ticket',
      estimatedStroops: '50100',
      actualStroops: '50500',
    });
    expect(comparison.passed).toBe(true);
    expect(comparison.deltaStroops).toBe(400);
  });

  it('flags an under-quote — the direction that fails transactions', () => {
    const comparison = compareFeeObservation({
      label: 'sdk.buy_ticket',
      estimatedStroops: 50_100,
      actualStroops: 90_000,
    });
    expect(comparison.passed).toBe(false);
    expect(comparison.verdict).toBe('under-quoted');
    expect(comparison.deltaStroops).toBe(39_900);
    expect(comparison.reason).toContain('rejected under load');
  });

  it('flags an over-quote — the direction that overcharges the user', () => {
    const comparison = compareFeeObservation({
      label: 'sdk.buy_ticket',
      estimatedStroops: 500_000,
      actualStroops: 50_100,
    });
    expect(comparison.passed).toBe(false);
    expect(comparison.verdict).toBe('over-quoted');
    expect(comparison.reason).toContain('quoted more than the network took');
  });

  it('rejects a zero actual charge (hardcoded feePaid) instead of passing it', () => {
    const comparison = compareFeeObservation({
      label: 'oracle.prng_reveal',
      estimatedStroops: 50_100,
      actualStroops: 0,
    });
    expect(comparison.passed).toBe(false);
    expect(comparison.verdict).toBe('invalid');
    expect(comparison.reason).toContain('hardcoded feePaid');
  });

  it('rejects a missing or unusable estimate', () => {
    expect(
      compareFeeObservation({ label: 'x', estimatedStroops: 'n/a', actualStroops: 50_100 }).verdict,
    ).toBe('invalid');
    expect(
      compareFeeObservation({ label: 'x', estimatedStroops: 0, actualStroops: 50_100 }).verdict,
    ).toBe('invalid');
    expect(
      compareFeeObservation({ label: 'x', estimatedStroops: 50_100, actualStroops: undefined })
        .verdict,
    ).toBe('invalid');
  });

  it('applies the wider surge band to surged observations only', () => {
    const observation = {
      label: 'sdk.buy_ticket',
      estimatedStroops: 50_100,
      actualStroops: 80_000,
    };
    const calm = compareFeeObservation(observation, config);
    const surged = compareFeeObservation({ ...observation, surge: true }, config);

    expect(calm.passed).toBe(false);
    expect(calm.tolerancePercent).toBe(config.normalTolerance.relativePercent);
    expect(surged.passed).toBe(true);
    expect(surged.tolerancePercent).toBe(config.surgeTolerance.relativePercent);
    expect(surged.allowedDeltaStroops).toBe(50_100);
  });

  it('still fails a surged estimate that misses by more than the surge band', () => {
    const comparison = compareFeeObservation(
      { label: 'sdk.buy_ticket', estimatedStroops: 50_100, actualStroops: 500_000, surge: true },
      config,
    );
    expect(comparison.passed).toBe(false);
    expect(comparison.verdict).toBe('under-quoted');
  });

  it('carries the observation details through for reporting', () => {
    const comparison = compareFeeObservation({
      label: 'sdk.buy_ticket',
      estimatedStroops: 50_100,
      actualStroops: 50_100,
      details: { txHash: 'abc', ledger: 42 },
    });
    expect(comparison.details).toEqual({ txHash: 'abc', ledger: 42 });
  });
});

describe('evaluateFeeAccuracy', () => {
  it('fails a run with no observations', () => {
    const report = evaluateFeeAccuracy([], config);
    expect(report.passed).toBe(false);
    expect(report.comparisons).toHaveLength(0);
    expect(report.summary).toContain('No fee observations');
  });

  it('passes a run where every observation is inside its band', () => {
    const report = evaluateFeeAccuracy(
      [
        { label: 'sdk.buy_ticket', estimatedStroops: 50_100, actualStroops: 50_100 },
        {
          label: 'oracle.prng_reveal',
          estimatedStroops: 60_000,
          actualStroops: 80_000,
          surge: true,
        },
      ],
      config,
    );

    expect(report.passed).toBe(true);
    expect(report.failures).toHaveLength(0);
    expect(report.surgeDetected).toBe(true);
    expect(report.summary).toContain('within tolerance');
  });

  it('collects every failure and marks the run as failed', () => {
    const report = evaluateFeeAccuracy(
      [
        { label: 'sdk.buy_ticket', estimatedStroops: 50_100, actualStroops: 50_100 },
        { label: 'sdk.create_raffle', estimatedStroops: 90_000, actualStroops: 30_000 },
      ],
      config,
    );

    expect(report.passed).toBe(false);
    expect(report.failures.map((failure) => failure.label)).toEqual(['sdk.create_raffle']);
    expect(report.summary).toContain('1 of 2 fee observations drifted');
  });

  it('is deterministic for a given timestamp', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const report = evaluateFeeAccuracy(
      [{ label: 'sdk.buy_ticket', estimatedStroops: 100, actualStroops: 100 }],
      config,
      now,
    );
    expect(report.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('projects a JSON-safe payload without the derived summary', () => {
    const report = evaluateFeeAccuracy(
      [{ label: 'sdk.buy_ticket', estimatedStroops: 100, actualStroops: 100 }],
      config,
    );
    const file = toReportFile(report);
    expect(file).not.toHaveProperty('summary');
    expect(() => JSON.stringify(file)).not.toThrow();
  });
});

describe('resolveFeeAccuracyConfig', () => {
  it('falls back to the documented defaults', () => {
    expect(resolveFeeAccuracyConfig({})).toEqual(DEFAULT_FEE_ACCURACY_CONFIG);
  });

  it('reads every documented environment override', () => {
    const resolved = resolveFeeAccuracyConfig({
      [FEE_ACCURACY_ENV_KEYS.normalRelativePercent]: '5',
      [FEE_ACCURACY_ENV_KEYS.normalAbsoluteStroops]: '500',
      [FEE_ACCURACY_ENV_KEYS.surgeRelativePercent]: '250',
      [FEE_ACCURACY_ENV_KEYS.surgeAbsoluteStroops]: '25000',
      [FEE_ACCURACY_ENV_KEYS.surgeThresholdStroops]: '20000',
    });

    expect(resolved).toEqual({
      normalTolerance: { relativePercent: 5, absoluteStroops: 500 },
      surgeTolerance: { relativePercent: 250, absoluteStroops: 25_000 },
      surgeThresholdStroops: 20_000,
    });
  });

  it('ignores blank and malformed overrides instead of failing the run', () => {
    const resolved = resolveFeeAccuracyConfig({
      [FEE_ACCURACY_ENV_KEYS.normalRelativePercent]: '  ',
      [FEE_ACCURACY_ENV_KEYS.normalAbsoluteStroops]: 'lots',
    });
    expect(resolved.normalTolerance).toEqual(DEFAULT_FEE_ACCURACY_CONFIG.normalTolerance);
  });
});
