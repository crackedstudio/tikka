/**
 * Spec for `response.ts` — the contract response trust boundary.
 *
 * Covers the three branches the SDK actually encounters:
 *  1. success  — legacy `success` flag and/or `status: 'SUCCESS'`
 *  2. contract error — `success: false` and/or `status: 'ERROR'` with a message
 *  3. unexpected shape — anything that is neither, rejected with a typed error
 *
 * Plus a fast-check property mirroring the parser fuzzing: normalisation is
 * total and typed — for ANY input it either returns a fully populated response
 * or throws `InvalidResponseError`, and never returns a partial object.
 */
import * as fc from 'fast-check';
import { normalizeContractResponse } from './response';
import { InvalidResponseError } from '../utils/errors';

describe('normalizeContractResponse', () => {
  describe('success branch', () => {
    it('normalises the legacy boolean success flag', () => {
      const response = normalizeContractResponse<number>({ success: true, value: 42 });

      expect(response).toEqual({ success: true, status: 'SUCCESS', value: 42 });
    });

    it('normalises the status string form', () => {
      const response = normalizeContractResponse<string>({ status: 'SUCCESS', value: 'ok' });

      expect(response.success).toBe(true);
      expect(response.status).toBe('SUCCESS');
      expect(response.value).toBe('ok');
      expect(response.error).toBeUndefined();
    });

    it('preserves optional metadata', () => {
      const response = normalizeContractResponse<number>({
        success: true,
        value: 7,
        transactionHash: 'abc',
        ledger: 123,
        warnings: ['heads up', 5],
      });

      expect(response.transactionHash).toBe('abc');
      expect(response.ledger).toBe(123);
      expect(response.warnings).toEqual(['heads up']);
    });

    it('rejects a success response that also carries an error message', () => {
      expect(() => normalizeContractResponse({ success: true, value: 1, error: 'boom' })).toThrow(
        InvalidResponseError,
      );
    });
  });

  describe('contract-error branch', () => {
    it('normalises a failure using the boolean flag', () => {
      const response = normalizeContractResponse({ success: false, error: 'Error(Contract, #35)' });

      expect(response).toMatchObject({
        success: false,
        status: 'ERROR',
        error: 'Error(Contract, #35)',
      });
    });

    it('normalises a failure using the status string', () => {
      const response = normalizeContractResponse({ status: 'ERROR', error: 'raffle is full' });

      expect(response.success).toBe(false);
      expect(response.status).toBe('ERROR');
      expect(response.error).toBe('raffle is full');
    });

    it('rejects a failure without an error message', () => {
      expect(() => normalizeContractResponse({ success: false })).toThrow(InvalidResponseError);
      expect(() => normalizeContractResponse({ status: 'ERROR', error: '   ' })).toThrow(
        InvalidResponseError,
      );
    });
  });

  describe('unexpected-shape branch', () => {
    const unexpectedShapes: Array<[string, unknown]> = [
      ['null', null],
      ['a number', 42],
      ['a string', 'oops'],
      ['an array', [1, 2, 3]],
      ['an object with no flags', { value: 1 }],
    ];

    for (const [label, raw] of unexpectedShapes) {
      it(`rejects ${label} with a typed InvalidResponseError`, () => {
        expect(() => normalizeContractResponse(raw)).toThrow(InvalidResponseError);
      });
    }

    it('rejects contradictory success/failure flags', () => {
      expect(() =>
        normalizeContractResponse({ success: true, status: 'ERROR', error: 'x' }),
      ).toThrow(InvalidResponseError);
      expect(() =>
        normalizeContractResponse({ success: false, status: 'SUCCESS', value: 1 }),
      ).toThrow(InvalidResponseError);
    });

    it('exposes the invalid payload as the error cause', () => {
      const raw = { unexpected: true };
      expect(() => normalizeContractResponse(raw)).toThrow(InvalidResponseError);
      try {
        normalizeContractResponse(raw);
      } catch (error) {
        expect((error as InvalidResponseError).cause).toBe(raw);
      }
    });
  });

  describe('property: total and typed for arbitrary input', () => {
    it('always returns a fully populated response or throws InvalidResponseError', () => {
      fc.assert(
        fc.property(fc.anything(), (raw) => {
          try {
            const response = normalizeContractResponse(raw);

            // A returned response is never partially populated.
            expect(typeof response.success).toBe('boolean');
            expect(response.status).toBe(response.success ? 'SUCCESS' : 'ERROR');
            if (response.success) {
              expect(response.error).toBeUndefined();
            } else {
              expect(typeof response.error).toBe('string');
              expect((response.error as string).trim().length).toBeGreaterThan(0);
            }
          } catch (error) {
            // The only failure mode is the typed error — never a raw Error/TypeError.
            expect(error).toBeInstanceOf(InvalidResponseError);
          }
        }),
        { numRuns: 1_000, verbose: false },
      );
    });
  });
});
