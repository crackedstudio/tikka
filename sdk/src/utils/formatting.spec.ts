import * as fs from 'fs';
import * as path from 'path';
import BigNumber from 'bignumber.js';
import * as fc from 'fast-check';
import {
  assertSafeAmount,
  multiplyAmountByQuantity,
  xlmToStroops,
  stroopsToXlm,
  normalizeAmount,
  formatContractResponse,
  truncateAddress,
  formatAddress,
} from './formatting';
import { TikkaSdkError, TikkaSdkErrorCode } from './errors';

/**
 * BigInt reference implementation of stroops → XLM.
 *
 * Mirrors the *tested* client-side formatter (client/src/utils/formatters.ts,
 * `formatXlm`), which uses BigInt integer math. Used to cross-check the SDK's
 * BigNumber-based `stroopsToXlm` on the domain the two implementations share
 * (valid, non-negative, integer stroops): the two must never disagree, since
 * the client renders what the SDK prices.
 */
function referenceStroopsToXlm(stroops: bigint): string {
  expect(stroops).toBeGreaterThanOrEqual(0n);
  const STROOPS_PER_XLM = 10_000_000n;
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  return `${whole.toString()}.${frac.toString().padStart(7, '0')}`;
}

/**
 * BigInt reference implementation of XLM → stroops. Inverse of the above for
 * values already expressible in stroops.
 */
function referenceXlmToStroops(xlm: string): bigint {
  const [whole, frac = ''] = xlm.split('.');
  expect(frac.length).toBeLessThanOrEqual(7);
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0') || '0');
}

describe('formatting — stroop/XLM precision', () => {
  describe('stroopsToXlm() — table-driven boundaries', () => {
    it.each([
      ['0', '0.0000000'],
      ['1', '0.0000001'],
      ['9', '0.0000009'],
      ['10', '0.0000010'],
      ['99', '0.0000099'],
      ['100', '0.0000100'],
      ['999', '0.0000999'],
      ['1000', '0.0001000'],
      ['9999', '0.0009999'],
      ['10000', '0.0010000'],
      ['100000', '0.0100000'],
      ['999999', '0.0999999'],
      ['1000000', '0.1000000'],
      ['9999999', '0.9999999'],
      ['10000000', '1.0000000'],
      ['10000001', '1.0000001'],
      ['1234567', '0.1234567'],
      ['15000000', '1.5000000'],
      ['99999999', '9.9999999'],
      ['100000000', '10.0000000'],
      // Trailing zeros in the stroop input must not change the result.
      ['100000000000', '10000.0000000'],
      // Far above Number.MAX_SAFE_INTEGER — precision-critical territory.
      [String(Number.MAX_SAFE_INTEGER + 1), '900719925.4740992'],
      ['18446744073709551615', '1844674407370.9551615'],
      ['99999999999999999999999999', '9999999999999999999.9999999'],
    ])('stroopsToXlm(%s) → %s', (stroops, expected) => {
      expect(stroopsToXlm(stroops)).toBe(expected);
    });

    it('accepts safe integer numbers without precision loss', () => {
      expect(stroopsToXlm(0)).toBe('0.0000000');
      expect(stroopsToXlm(1)).toBe('0.0000001');
      expect(stroopsToXlm(10_000_000)).toBe('1.0000000');
      expect(stroopsToXlm(Number.MAX_SAFE_INTEGER)).toBe('900719925.4740991');
    });

    it('rejects unsafe number inputs before they can be precision-corrupted', () => {
      expect(() => stroopsToXlm(Number.MAX_SAFE_INTEGER + 1)).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm(1.5)).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm(-1)).toThrow(TikkaSdkError);
      try {
        stroopsToXlm(Number.MAX_SAFE_INTEGER + 1);
        throw new Error('expected stroopsToXlm(MAX_SAFE_INTEGER + 1) to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(TikkaSdkError);
        expect((err as TikkaSdkError).code).toBe(TikkaSdkErrorCode.ValidationError);
      }
    });

    it('rejects malformed and fractional stroop strings', () => {
      expect(() => stroopsToXlm('1.5')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm('-1')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm('12a')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm('1e3')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm(' 1')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm({} as any)).toThrow(TikkaSdkError);
      expect(stroopsToXlm('')).toBe('0.0000000');
    });
  });

  describe('xlmToStroops() — table-driven boundaries', () => {
    it.each([
      ['0', '0'],
      ['0.0000001', '1'],
      ['0.0000009', '9'],
      ['0.000001', '10'],
      ['0.00001', '100'],
      ['0.0001', '1000'],
      ['0.001', '10000'],
      ['0.01', '100000'],
      ['0.1', '1000000'],
      ['0.9999999', '9999999'],
      ['1', '10000000'],
      ['1.0000001', '10000001'],
      ['1.5', '15000000'],
      ['9.9999999', '99999999'],
      ['10', '100000000'],
      // Trailing zeros must not affect the result.
      ['1.5000000', '15000000'],
      ['10.0000000', '100000000'],
      // Above Number.MAX_SAFE_INTEGER stroops — must stay string-precise.
      ['9007199254740.993', '90071992547409930000'],
      ['1844674407370.9551615', '18446744073709551615'],
      ['9999999999999999999999.9999999', '99999999999999999999999999999'],
    ])('xlmToStroops(%s) → %s', (xlm, expected) => {
      expect(xlmToStroops(xlm)).toBe(expected);
    });

    it('is strict: rejects inputs beyond 7 decimal places instead of rounding silently', () => {
      // A silent HALF-UP rounding path here could misprice tickets by one stroop.
      expect(() => xlmToStroops('0.00000015')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops('0.00000014')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops('1.00000001')).toThrow(TikkaSdkError);
    });

    it('rejects inputs that cannot map to stroops without ambiguity', () => {
      expect(() => xlmToStroops('1.00000001')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops('-1')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops('1e3')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops('abc')).toThrow(TikkaSdkError);
      expect(() => xlmToStroops(1.5)).toThrow(TikkaSdkError);
      expect(xlmToStroops('')).toBe('0');
      expect(xlmToStroops(undefined as any)).toBe('0');
      expect(xlmToStroops(null as any)).toBe('0');
    });
  });

  describe('round-tripping — toStroops(toXlm(x)) === x for the full range', () => {
    it('cross-checks stroopsToXlm against the client BigInt reference at boundaries', () => {
      const STROOPS_PER_XLM = 10_000_000n;
      const boundaries = [
        0n,
        1n,
        7n,
        9n,
        10n,
        999n,
        1000n,
        9999n,
        STROOPS_PER_XLM - 1n,
        STROOPS_PER_XLM,
        STROOPS_PER_XLM + 1n,
        2n * STROOPS_PER_XLM,
        15000000n,
        99999999n,
        100000000n,
        BigInt(Number.MAX_SAFE_INTEGER),
        BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        2n ** 53n,
        2n ** 63n,
        2n ** 64n - 1n,
        10n ** 18n,
        10n ** 20n,
      ];
      for (const stroops of boundaries) {
        const expected = referenceStroopsToXlm(stroops);
        expect(stroopsToXlm(stroops.toString())).toBe(expected);
        // Number input must agree whenever the value is a safe integer.
        if (stroops <= BigInt(Number.MAX_SAFE_INTEGER)) {
          expect(stroopsToXlm(Number(stroops))).toBe(expected);
        }
      }
    });

    it('stays exact for every single stroop from 0 up to 0.01 XLM, exhaustively', () => {
      // Exhaustive over the smallest displayable units; the fast-check property
      // below covers the wide range statistically.
      for (let stroops = 0n; stroops < 100_000n; stroops++) {
        expect(stroopsToXlm(stroops.toString())).toBe(referenceStroopsToXlm(stroops));
      }
    });

    it('stays exact ±1 stroop around every power-of-ten boundary up to 10^18 stroops', () => {
      for (let exp = 1n; exp <= 18n; exp++) {
        const center = 10n ** exp;
        for (const stroops of [center - 1n, center, center + 1n]) {
          expect(stroopsToXlm(stroops.toString())).toBe(referenceStroopsToXlm(stroops));
        }
      }
    });

    it('round-trips exactly: toStroops(toXlm(x)) === x for sampled values across the full range', () => {
      const STROOPS_PER_XLM = 10_000_000n;
      const samples = [
        0n,
        1n,
        STROOPS_PER_XLM - 1n,
        STROOPS_PER_XLM,
        1234567n,
        99999999n,
        123456789012345n,
        BigInt(Number.MAX_SAFE_INTEGER),
        2n ** 63n,
        2n ** 64n - 1n,
        10n ** 18n,
        10n ** 20n,
        99999999999999999999999999n,
      ];
      for (const stroops of samples) {
        const xlm = stroopsToXlm(stroops.toString());
        expect(xlmToStroops(xlm)).toBe(stroops.toString());
      }
    });

    it('round-trips exactly for arbitrary stroop values (property-based, fast-check)', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: 2n ** 64n - 1n }), (stroops) => {
          const xlm = stroopsToXlm(stroops.toString());
          expect(xlm).toMatch(/^\d+\.\d{7}$/);
          expect(referenceStroopsToXlm(stroops)).toBe(xlm);
          expect(xlmToStroops(xlm)).toBe(stroops.toString());
        }),
        { numRuns: 5_000 },
      );
    });

    it('round-trips arbitrary XLM strings with up to 7 decimals (property-based, fast-check)', () => {
      const xlmArbitrary = fc
        .tuple(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.nat({ max: 9_999_999 }))
        .map(([whole, frac]) => `${whole}.${frac.toString().padStart(7, '0')}`);
      fc.assert(
        fc.property(xlmArbitrary, (xlm) => {
          const stroops = xlmToStroops(xlm);
          expect(stroops).toMatch(/^\d+$/);
          expect(referenceXlmToStroops(xlm)).toBe(BigInt(stroops));
          expect(stroopsToXlm(stroops)).toBe(xlm);
        }),
        { numRuns: 5_000 },
      );
    });
  });

  describe('no code path converts a stroop string through Number', () => {
    const source = fs.readFileSync(path.join(__dirname, 'formatting.ts'), 'utf8');

    it('formatting.ts never coerces numeric strings via Number()/parseFloat()/unary +', () => {
      const lines = source.split('\n');
      const violations = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => {
          // Strip line comments so mentioning the policy in a comment is not a violation.
          const code = line.split('//')[0];
          return (
            /(?<![.\w])Number\s*\(/.test(code) ||
            /\bparseFloat\s*\(/.test(code) ||
            /(?<![.\w])\+\s*(xlm|stroops|amount|valStr|stroopsStr|amountStr)\b/.test(code) ||
            /(?<![.\w])-\s*(xlm|stroops|amount)\b/.test(code)
          );
        });
      expect(violations).toEqual([]);
    });

    it('keeps digits out of Number — failing example proves the guard detects coercion', () => {
      const code = "const n = Number('9007199254740993');";
      expect(Number('9007199254740993')).not.toBe(9007199254740993n);
      const probe = code.split('//')[0];
      expect(/(?<![.\w])Number\s*\(/.test(probe)).toBe(true);
    });

    it('routes every conversion through BigNumber', () => {
      expect(source).toContain('new BigNumber(xlm).times(STROOPS_PER_XLM)');
      expect(source).toContain('bn.div(STROOPS_PER_XLM).toFixed(7)');
      expect(source).toContain('new BigNumber(amountStr)');
    });
  });

  describe('cross-check with client/src/utils/formatters.ts', () => {
    const CLIENT_FORMATTERS = path.resolve(__dirname, '../../../client/src/utils/formatters.ts');

    it('shares the stroops-per-XLM constant (10,000,000)', () => {
      const clientSource = fs.readFileSync(CLIENT_FORMATTERS, 'utf8');
      expect(clientSource).toContain('STROOPS_PER_XLM = 10_000_000n');
      const sdkSource = fs.readFileSync(path.join(__dirname, 'formatting.ts'), 'utf8');
      expect(sdkSource).toContain('10_000_000');
    });

    it('agrees with the client formatter on every shared boundary value', () => {
      const clientSource = fs.readFileSync(CLIENT_FORMATTERS, 'utf8');
      expect(clientSource).toBeTruthy();
      // Values asserted by client/src/utils/formatters.spec.ts for formatXlm.
      const shared = [
        ['0', '0.0000000'],
        ['1', '0.0000001'],
        ['10000000', '1.0000000'],
        ['10000001', '1.0000001'],
        ['1234567', '0.1234567'],
        ['12345678901234567890000000', '1234567890123456789.0000000'],
        ['18446744073709551615', '1844674407370.9551615'],
      ] as const;
      for (const [stroops, xlm] of shared) {
        expect(stroopsToXlm(stroops)).toBe(xlm);
      }
    });
  });

  describe('assertSafeAmount()', () => {
    it('accepts valid decimal strings and safe integers', () => {
      expect(() => assertSafeAmount('10', 'test')).not.toThrow();
      expect(() => assertSafeAmount('10.5', 'test')).not.toThrow();
      expect(() => assertSafeAmount('0.0000001', 'test')).not.toThrow();
      expect(() => assertSafeAmount('0', 'test')).not.toThrow();
      expect(() => assertSafeAmount(0, 'test')).not.toThrow();
      expect(() => assertSafeAmount(100, 'test')).not.toThrow();
    });

    it('rejects unsafe fractional, negative, and malformed inputs with the validation code', () => {
      for (const bad of [
        1.5,
        0.1,
        -10,
        null,
        undefined,
        {},
        'abc',
        '1.2.3',
        '',
        '   ',
        '-5',
        '1e-5',
      ]) {
        try {
          assertSafeAmount(bad as any, 'test');
          throw new Error(`expected assertSafeAmount(${String(bad)}) to throw`);
        } catch (err) {
          expect(err).toBeInstanceOf(TikkaSdkError);
          expect((err as TikkaSdkError).code).toBe(TikkaSdkErrorCode.ValidationError);
        }
      }
    });

    it('rejects non-numeric types (e.g. symbol, bigint, boolean) outright', () => {
      // No string form can reach the NaN check in assertSafeAmount, so these
      // exercise the final type-guard branch rather than the BigNumber guard.
      expect(() => assertSafeAmount(Symbol('x') as any, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount(10n as any, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount(true as any, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount([] as any, 'test')).toThrow(TikkaSdkError);
    });

    it('honours the maxDecimals parameter', () => {
      expect(() => assertSafeAmount('1.00000001', 'xlm', 7)).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('0.00000005', 'xlm', 7)).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('1.00000001', 'token', 18)).not.toThrow();
    });
  });

  describe('multiplyAmountByQuantity()', () => {
    it.each([
      ['1.5', 3, undefined, '4.5000000'],
      ['0.1', 2, undefined, '0.2000000'],
      ['0.12345675', 2, undefined, '0.2469135'],
      ['0.0000001', 5, undefined, '0.0000005'],
      ['1.123456789', 2, 9, '2.246913578'],
      ['1.5', 3, 18, '4.500000000000000000'],
      ['0.1', 2, 2, '0.20'],
      ['2', 1, 0, '2'],
    ] as const)('%s × %s (dp=%s) → %s', (amount, quantity, decimals, expected) => {
      expect(multiplyAmountByQuantity(amount, quantity, decimals as number | undefined)).toBe(
        expected,
      );
    });

    it('preserves precision for huge amounts far above Number.MAX_SAFE_INTEGER', () => {
      expect(multiplyAmountByQuantity('1234567890123456789.0000001', 3)).toBe(
        '3703703670370370367.0000003',
      );
    });

    it('rejects invalid quantity, decimals, and amount inputs', () => {
      expect(() => multiplyAmountByQuantity('1.5', -1)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 0)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 1.5)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', Number.MAX_SAFE_INTEGER + 1)).toThrow(
        TikkaSdkError,
      );
      expect(() => multiplyAmountByQuantity('abc', 2)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 2, -1)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 2, 19)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 2, 1.5 as any)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', '2' as any)).toThrow(TikkaSdkError);
    });
  });

  describe('normalizeAmount()', () => {
    it.each([
      ['1.5', undefined, '1.5000000'],
      [10, undefined, '10.0000000'],
      ['1.5', 18, '1.500000000000000000'],
      ['1.5', 2, '1.50'],
      ['0', undefined, '0.0000000'],
    ] as const)('normalizeAmount(%s, %s) → %s', (amount, decimals, expected) => {
      expect(normalizeAmount(amount, decimals as number | undefined)).toBe(expected);
    });

    it('returns the zero string for empty, null, and undefined input', () => {
      expect(normalizeAmount('' as any)).toBe('0.0000000');
      expect(normalizeAmount(undefined as any)).toBe('0.0000000');
      expect(normalizeAmount(null as any)).toBe('0.0000000');
      expect(normalizeAmount('' as any, 2)).toBe('0.00');
    });

    it('rejects unsafe float number input', () => {
      expect(() => normalizeAmount(1.5)).toThrow(TikkaSdkError);
    });
  });

  describe('formatContractResponse()', () => {
    it.each([
      ['100000000', undefined, '100000000.0000000'],
      ['0', undefined, '0.0000000'],
      [500, undefined, '500.0000000'],
      ['1000', 2, '1000.00'],
    ] as const)('formatContractResponse(%s, %s) → %s', (value, decimals, expected) => {
      expect(formatContractResponse(value, decimals as number | undefined)).toBe(expected);
    });

    it('rejects JS float numbers — they are precision-corrupted before BigNumber sees them', () => {
      // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754 — must never be formatted as currency.
      expect(() => formatContractResponse(0.1 + 0.2)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse(1.5)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse(-1)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse(-100)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse({} as any)).toThrow(TikkaSdkError);
    });

    it('throws for non-numeric garbage strings', () => {
      expect(() => formatContractResponse('abc')).toThrow(TikkaSdkError);
    });
  });

  describe('truncateAddress()/formatAddress()', () => {
    const addr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890WXYZ';

    it('truncates long addresses (keeps chars+1 leading chars) as GABCD...last4', () => {
      expect(truncateAddress(addr)).toBe('GABCD...WXYZ');
      expect(formatAddress(addr)).toBe('GABCD...WXYZ');
    });

    it('returns short addresses unchanged and empty for empty input', () => {
      expect(truncateAddress('G12345')).toBe('G12345');
      expect(truncateAddress('')).toBe('');
      expect(formatAddress('')).toBe('');
    });

    it('honours a custom char count', () => {
      expect(truncateAddress(addr, 6)).toBe('GABCDEF...90WXYZ');
    });
  });

  describe('BigNumber global configuration', () => {
    it('uses 7 decimal places, ROUND_HALF_UP, and non-exponential formatting in the relevant range', () => {
      expect(BigNumber.config().DECIMAL_PLACES).toBe(7);
      expect(BigNumber.config().ROUNDING_MODE).toBe(BigNumber.ROUND_HALF_UP);
      expect(BigNumber.config().EXPONENTIAL_AT).toEqual([-12, 20]);
      // 0.00000005 rounds HALF-UP to 0.0000001 (not banker's rounding to 0).
      expect(new BigNumber(0.00000005).toFixed(7)).toBe('0.0000001');
    });
  });
});
