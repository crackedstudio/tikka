import { toStroops, stroopsToXlmString, PROTOCOL_BASE_FEE_STROOPS } from './units';
import { detectSurge, extractFeeChargedStroops, minimumInclusionFeeStroops } from './network';

describe('toStroops', () => {
  it('parses numbers, numeric strings and bigints', () => {
    expect(toStroops(50_100)).toBe(50_100);
    expect(toStroops('50100')).toBe(50_100);
    expect(toStroops(' 50100 ')).toBe(50_100);
    expect(toStroops(100n)).toBe(100);
    expect(toStroops(100.9)).toBe(100);
  });

  it('parses objects whose toString() yields digits (xdr.Int64)', () => {
    expect(toStroops({ toString: () => '51230' })).toBe(51_230);
  });

  it('rejects missing, negative, fractional and non-numeric values', () => {
    expect(toStroops(undefined)).toBeUndefined();
    expect(toStroops(null)).toBeUndefined();
    expect(toStroops(-1)).toBeUndefined();
    expect(toStroops('-1')).toBeUndefined();
    expect(toStroops('1.5')).toBeUndefined();
    expect(toStroops('abc')).toBeUndefined();
    expect(toStroops({})).toBeUndefined();
    expect(toStroops(Number.NaN)).toBeUndefined();
    expect(toStroops(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('stroopsToXlmString', () => {
  it('renders 7 decimal places', () => {
    expect(stroopsToXlmString(50_100)).toBe('0.0050100');
    expect(stroopsToXlmString(PROTOCOL_BASE_FEE_STROOPS)).toBe('0.0000100');
  });

  it('accepts untrusted fee shapes and marks unusable input as unknown', () => {
    expect(stroopsToXlmString('50100')).toBe('0.0050100');
    expect(stroopsToXlmString(undefined)).toBe('unknown');
    expect(stroopsToXlmString(-5)).toBe('unknown');
    expect(stroopsToXlmString(Number.NaN)).toBe('unknown');
  });
});

describe('extractFeeChargedStroops', () => {
  it('reads the xdr accessors used by resultXdr', () => {
    const resultXdr = { feeCharged: () => ({ toString: () => '51230' }) };
    expect(extractFeeChargedStroops(resultXdr)).toBe(51_230);
  });

  it('descends into the resultXdr of a getTransaction response', () => {
    const response = {
      status: 'SUCCESS',
      latestLedger: '50100',
      resultXdr: { feeCharged: () => ({ toString: () => '51230' }) },
    };
    expect(extractFeeChargedStroops(response)).toBe(51_230);
  });

  it('prefers a top-level fee over a nested result', () => {
    const response = {
      feeCharged: '50100',
      resultXdr: { feeCharged: () => ({ toString: () => '51230' }) },
    };
    expect(extractFeeChargedStroops(response)).toBe(50_100);
  });

  it('returns undefined when the payload reports no fee', () => {
    expect(
      extractFeeChargedStroops({ status: 'SUCCESS', resultXdr: { feeCharged: () => 0 } }),
    ).toBe(0);
    expect(extractFeeChargedStroops({ status: 'NOT_FOUND' })).toBeUndefined();
    expect(extractFeeChargedStroops(null)).toBeUndefined();
  });

  it('reads Soroban RPC and Horizon payload fields', () => {
    expect(extractFeeChargedStroops({ feeCharged: '50100' })).toBe(50_100);
    expect(extractFeeChargedStroops({ fee_charged: 50_100 })).toBe(50_100);
  });

  it('reads a bare amount', () => {
    expect(extractFeeChargedStroops(50_100)).toBe(50_100);
    expect(extractFeeChargedStroops('50100')).toBe(50_100);
  });

  it('returns undefined when no fee is reported (never 0)', () => {
    expect(extractFeeChargedStroops(undefined)).toBeUndefined();
    expect(extractFeeChargedStroops(null)).toBeUndefined();
    expect(extractFeeChargedStroops({ status: 'SUCCESS' })).toBeUndefined();
    expect(extractFeeChargedStroops({ feeCharged: 0 })).toBe(0);
  });
});

describe('detectSurge', () => {
  const stats = (mode: string, min = '100', max = '100') => ({
    latestLedger: 1234,
    sorobanInclusionFee: { min, mode, p50: mode, p95: max, max },
  });

  it('reports no surge below the threshold', () => {
    const observation = detectSurge(stats('100'), 1_000);
    expect(observation.surging).toBe(false);
    expect(observation.inclusionFeeStroops).toBe(100);
    expect(observation.latestLedger).toBe(1234);
    expect(observation.reason).toContain('below the surge threshold');
  });

  it('reports a surge when the mode inclusion fee reaches the threshold', () => {
    const observation = detectSurge(stats('5000', '2500', '9000'), 1_000);
    expect(observation.surging).toBe(true);
    expect(observation.minInclusionFeeStroops).toBe(2_500);
    expect(observation.maxInclusionFeeStroops).toBe(9_000);
    expect(observation.reason).toContain('surge threshold');
  });

  it('reports a surge when even the cheapest observed fee is elevated', () => {
    expect(detectSurge(stats('200', '1500', '4000'), 1_000).surging).toBe(true);
  });

  it('is not surged by a single expensive ledger (max is ignored)', () => {
    expect(detectSurge(stats('100', '100', '50000'), 1_000).surging).toBe(false);
  });

  it('treats missing or malformed stats as not surged', () => {
    expect(detectSurge(undefined, 1_000).surging).toBe(false);
    expect(detectSurge(null, 1_000).surging).toBe(false);
    expect(detectSurge({ sorobanInclusionFee: null }, 1_000).surging).toBe(false);
    expect(detectSurge({ sorobanInclusionFee: { mode: 'n/a' } }, 1_000).surging).toBe(false);
    expect(detectSurge(stats('100'), 0).surging).toBe(false);
  });
});

describe('minimumInclusionFeeStroops', () => {
  it('never drops below the protocol base fee', () => {
    expect(minimumInclusionFeeStroops(undefined)).toBe(PROTOCOL_BASE_FEE_STROOPS);
    expect(minimumInclusionFeeStroops(50)).toBe(PROTOCOL_BASE_FEE_STROOPS);
  });

  it('uses the observed inclusion fee when it is higher', () => {
    expect(minimumInclusionFeeStroops(5_000)).toBe(5_000);
  });
});
