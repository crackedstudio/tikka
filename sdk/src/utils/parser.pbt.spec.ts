/**
 * Property-based tests for the SDK contract response parser
 * (`sdk/src/utils/parser.ts`), mirroring the indexer's
 * `event-parser.service.pbt.spec.ts`.
 *
 * The parser consumes `ScVal` structures returned by a contract that can be
 * upgraded independently of this SDK, so its input is a trust boundary. These
 * tests fuzz it with arbitrary structures and assert the parser is total:
 *  - it never throws, and
 *  - every event it returns is fully populated (`type` is a non-empty string,
 *    `raffleId` is a finite, non-negative integer).
 * Malformed input must be dropped — never emitted as a partially populated
 * object such as `{ type: 'RaffleCreated', raffleId: NaN }`.
 */
import * as fc from 'fast-check';
import { xdr, nativeToScVal } from '@stellar/stellar-sdk';
import { TransactionHistoryParser } from './parser';

/** Honours the indexer convention of 1 000 iterations per property. */
const NUM_RUNS = 1_000;

type AnyScVal = xdr.ScVal;

/** Builds a valid ScVal for any generated value, falling back when rejected. */
function toScVal(value: unknown): AnyScVal {
  try {
    return nativeToScVal(value as any);
  } catch {
    return nativeToScVal(0);
  }
}

/** Minimal v0 ContractEvent stand-in understood by the parser. */
function mockEvent(topics: AnyScVal[], data: AnyScVal): any {
  return {
    body: () => ({
      arm: () => 'v0',
      v0: () => ({ topics: () => topics, data: () => data }),
    }),
  };
}

/** Minimal v3 TransactionMeta stand-in wrapping the given events. */
function mockMeta(events: any[]): any {
  return {
    arm: () => 'v3',
    v3: () => ({ sorobanMeta: () => ({ events: () => events }) }),
  };
}

const arbitraryScVal: fc.Arbitrary<AnyScVal> = fc.anything().map(toScVal);
const arbitraryTopics: fc.Arbitrary<AnyScVal[]> = fc.array(arbitraryScVal, {
  minLength: 0,
  maxLength: 4,
});
const knownEventName = fc.constantFrom(
  'RaffleCreated',
  'TicketPurchased',
  'RaffleCancelled',
  'TicketRefunded',
  'RaffleFinalized',
);
/** Values that must never be coerced into a numeric raffle id. */
const nonNumericId = fc.oneof(
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.record({ nested: fc.string() }),
  fc.array(fc.string()),
);

describe('TransactionHistoryParser — property-based tests (fast-check)', () => {
  let fromXdrSpy: jest.SpyInstance;

  beforeEach(() => {
    fromXdrSpy = jest.spyOn(xdr.TransactionMeta, 'fromXDR');
  });

  afterEach(() => {
    fromXdrSpy.mockRestore();
  });

  it('Property 1: parseResult never throws for arbitrary metadata strings', () => {
    fc.assert(
      fc.property(fc.string(), (rawXdr) => {
        expect(() => TransactionHistoryParser.parseResult(rawXdr)).not.toThrow();
      }),
      { numRuns: NUM_RUNS, verbose: false },
    );
  });

  it('Property 2: every returned event is fully populated for arbitrary ScVals', () => {
    fc.assert(
      fc.property(arbitraryTopics, arbitraryScVal, (topics, data) => {
        fromXdrSpy.mockReturnValue(mockMeta([mockEvent(topics, data)]));

        const events = TransactionHistoryParser.parseResult('mock-xdr');

        for (const event of events) {
          expect(typeof event.type).toBe('string');
          expect(event.type.length).toBeGreaterThan(0);
          expect(Number.isInteger(event.raffleId)).toBe(true);
          expect(event.raffleId).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: NUM_RUNS, verbose: false },
    );
  });

  it('Property 3: a known event with a non-numeric raffle id is dropped, never NaN', () => {
    fc.assert(
      fc.property(knownEventName, nonNumericId, (eventName, badId) => {
        const topics = [nativeToScVal(eventName, { type: 'symbol' }), toScVal(badId)];
        fromXdrSpy.mockReturnValue(mockMeta([mockEvent(topics, toScVal({}))]));

        const events = TransactionHistoryParser.parseResult('mock-xdr');

        for (const event of events) {
          expect(Number.isInteger(event.raffleId)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS, verbose: false },
    );
  });

  it('Property 4: arbitrary topics/data never leak a non-string event type', () => {
    // topics[0] can be any ScVal (number, bool, map, …): none of them is a
    // valid event name, so nothing may be returned.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.record({ a: fc.integer() }),
        ),
        arbitraryScVal,
        (badName, data) => {
          const topics = [toScVal(badName), nativeToScVal(1)];
          fromXdrSpy.mockReturnValue(mockMeta([mockEvent(topics, data)]));

          expect(TransactionHistoryParser.parseResult('mock-xdr')).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS, verbose: false },
    );
  });

  it('Property 5: parsing the same metadata twice is deterministic', () => {
    fc.assert(
      fc.property(arbitraryTopics, arbitraryScVal, (topics, data) => {
        fromXdrSpy.mockReturnValue(mockMeta([mockEvent(topics, data)]));

        expect(TransactionHistoryParser.parseResult('mock-xdr')).toEqual(
          TransactionHistoryParser.parseResult('mock-xdr'),
        );
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('Property 6: empty topic lists yield no events', () => {
    fc.assert(
      fc.property(arbitraryScVal, (data) => {
        fromXdrSpy.mockReturnValue(mockMeta([mockEvent([], data)]));

        expect(TransactionHistoryParser.parseResult('mock-xdr')).toEqual([]);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('Property 7: non-v3 metadata yields no events', () => {
    fc.assert(
      fc.property(fc.constantFrom('v0', 'v1', 'v2'), (arm) => {
        fromXdrSpy.mockReturnValue({ arm: () => arm } as any);

        expect(TransactionHistoryParser.parseResult('mock-xdr')).toEqual([]);
      }),
      { numRuns: 50, verbose: false },
    );
  });
});
