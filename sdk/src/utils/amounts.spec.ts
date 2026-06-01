import {
  assertSafeAmount,
  multiplyAmountByQuantity,
  xlmToStroops,
  stroopsToXlm,
  normalizeAmount,
  formatContractResponse,
} from './formatting';
import { TikkaSdkError } from './errors';

describe('BigNumber Amount Utilities', () => {
  describe('assertSafeAmount()', () => {
    it('accepts safe numeric strings', () => {
      expect(() => assertSafeAmount('10', 'test')).not.toThrow();
      expect(() => assertSafeAmount('10.5', 'test')).not.toThrow();
      expect(() => assertSafeAmount('0.0000001', 'test')).not.toThrow();
      expect(() => assertSafeAmount('0', 'test')).not.toThrow();
    });

    it('accepts safe integer numbers', () => {
      expect(() => assertSafeAmount(100, 'test')).not.toThrow();
      expect(() => assertSafeAmount(0, 'test')).not.toThrow();
    });

    it('rejects unsafe number inputs (fractional numbers)', () => {
      expect(() => assertSafeAmount(1.5, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount(0.1, 'test')).toThrow(TikkaSdkError);
    });

    it('rejects non-numeric strings', () => {
      expect(() => assertSafeAmount('abc', 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('1.2.3', 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('', 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('   ', 'test')).toThrow(TikkaSdkError);
    });

    it('rejects negative amounts', () => {
      expect(() => assertSafeAmount('-5', 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount(-10, 'test')).toThrow(TikkaSdkError);
    });

    it('rejects amounts exceeding 7 decimal places', () => {
      expect(() => assertSafeAmount('1.00000001', 'test', 7)).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount('0.00000005', 'test', 7)).toThrow(TikkaSdkError);
    });

    it('rejects scientific notation', () => {
      expect(() => assertSafeAmount('1e-5', 'test')).toThrow(TikkaSdkError);
    });

    it('rejects null, undefined and other types', () => {
      expect(() => assertSafeAmount(null, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount(undefined, 'test')).toThrow(TikkaSdkError);
      expect(() => assertSafeAmount({}, 'test')).toThrow(TikkaSdkError);
    });
  });

  describe('multiplyAmountByQuantity()', () => {
    it('multiplies amount string by a quantity', () => {
      expect(multiplyAmountByQuantity('1.5', 3)).toBe('4.5000000');
      expect(multiplyAmountByQuantity('0.1', 2)).toBe('0.2000000');
    });

    it('rounds using HALF_UP half-way cases correctly', () => {
      // 0.12345675 * 2 = 0.24691350
      expect(multiplyAmountByQuantity('0.12345675', 2)).toBe('0.2469135');
      // 0.0000001 * 5 = 0.0000005
      expect(multiplyAmountByQuantity('0.0000001', 5)).toBe('0.0000005');
    });

    it('respects custom decimals parameter for high-precision tokens', () => {
      // Bug fix: previously hardcoded 7 dp, silently truncating 18 dp tokens
      expect(multiplyAmountByQuantity('1.123456789', 2, 9)).toBe('2.246913578');
      expect(multiplyAmountByQuantity('1.5', 3, 18)).toBe('4.500000000000000000');
      expect(multiplyAmountByQuantity('0.1', 2, 2)).toBe('0.20');
    });

    it('rejects invalid inputs', () => {
      expect(() => multiplyAmountByQuantity('1.5', -1)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 1.5)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('abc', 2)).toThrow(TikkaSdkError);
    });

    it('rejects invalid decimals parameter', () => {
      expect(() => multiplyAmountByQuantity('1.5', 2, -1)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 2, 19)).toThrow(TikkaSdkError);
      expect(() => multiplyAmountByQuantity('1.5', 2, 1.5 as any)).toThrow(TikkaSdkError);
    });
  });

  describe('xlmToStroops()', () => {
    it('converts safe strings to stroops', () => {
      expect(xlmToStroops('10')).toBe('100000000');
      expect(xlmToStroops('1.5')).toBe('15000000');
      expect(xlmToStroops('0.0000001')).toBe('1');
    });

    it('rejects unsafe floating point inputs', () => {
      expect(() => xlmToStroops(1.5)).toThrow(TikkaSdkError);
    });
  });

  describe('stroopsToXlm()', () => {
    it('converts stroops to human-readable strings', () => {
      expect(stroopsToXlm('100000000')).toBe('10.0000000');
      expect(stroopsToXlm('15000000')).toBe('1.5000000');
      expect(stroopsToXlm(1)).toBe('0.0000001');
    });

    it('rejects non-integer values', () => {
      expect(() => stroopsToXlm('1.5')).toThrow(TikkaSdkError);
      expect(() => stroopsToXlm(1.5)).toThrow(TikkaSdkError);
    });
  });

  describe('normalizeAmount()', () => {
    it('normalizes to 7 decimal places by default', () => {
      expect(normalizeAmount('1.5')).toBe('1.5000000');
      expect(normalizeAmount(10)).toBe('10.0000000');
    });

    it('respects custom decimals parameter', () => {
      // Bug fix: previously always returned 7 dp
      expect(normalizeAmount('1.5', 18)).toBe('1.500000000000000000');
      expect(normalizeAmount('1.5', 2)).toBe('1.50');
    });

    it('returns zero string for empty/null/undefined', () => {
      expect(normalizeAmount('' as any)).toBe('0.0000000');
    });

    it('rejects unsafe float number input', () => {
      expect(() => normalizeAmount(1.5)).toThrow(TikkaSdkError);
    });
  });

  describe('formatContractResponse()', () => {

    it('formats a string amount to 7 dp by default', () => {
      expect(formatContractResponse('100000000')).toBe('100000000.0000000');
      expect(formatContractResponse('0')).toBe('0.0000000');
    });

    it('formats a safe integer number', () => {
      expect(formatContractResponse(500)).toBe('500.0000000');
    });

    it('rejects JS float numbers (Bug fix: previously allowed)', () => {
      // 0.1 + 0.2 produces 0.30000000000000004 in JS — this must be rejected
      expect(() => formatContractResponse(0.1 + 0.2)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse(1.5)).toThrow(TikkaSdkError);
      expect(() => formatContractResponse(-1)).toThrow(TikkaSdkError);
    });

    it('rejects negative integers', () => {
      expect(() => formatContractResponse(-100)).toThrow(TikkaSdkError);
    });

    it('accepts custom decimals', () => {
      expect(formatContractResponse('1000', 2)).toBe('1000.00');
    });
  });
});
