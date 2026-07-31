import {
  assertValidRaffleId,
  assertValidStroopsAmount,
  assertValidTicketQuantity,
  InvalidTicketPurchaseError,
  validateBuyTicketInputs,
  validateBuyTicketsInputs,
} from './purchase-validation';
import { TICKET_CONSTRAINTS } from './ticket.types';
import { TikkaSdkErrorCode } from '../../utils/errors';

describe('purchase-validation', () => {
  describe('assertValidRaffleId', () => {
    it.each([0, -1, 1.5, NaN, Infinity, -Infinity])(
      'rejects malformed raffle id %p with typed error',
      (raffleId) => {
        expect(() => assertValidRaffleId(raffleId as number)).toThrow(InvalidTicketPurchaseError);
        try {
          assertValidRaffleId(raffleId as number);
        } catch (err) {
          expect(err).toMatchObject({
            field: 'raffleId',
            code: TikkaSdkErrorCode.ValidationError,
          });
        }
      },
    );

    it('accepts a positive integer raffle id', () => {
      expect(() => assertValidRaffleId(1)).not.toThrow();
    });
  });

  describe('assertValidTicketQuantity', () => {
    it('rejects 0', () => {
      expect(() => assertValidTicketQuantity(0)).toThrow(InvalidTicketPurchaseError);
      expect(() => assertValidTicketQuantity(0)).toThrow(
        `quantity must be at least ${TICKET_CONSTRAINTS.MIN_QUANTITY}`,
      );
    });

    it('rejects negative', () => {
      expect(() => assertValidTicketQuantity(-5)).toThrow(InvalidTicketPurchaseError);
    });

    it('rejects non-integer', () => {
      expect(() => assertValidTicketQuantity(1.5)).toThrow(/must be an integer/);
    });

    it('rejects above max', () => {
      expect(() =>
        assertValidTicketQuantity(TICKET_CONSTRAINTS.MAX_QUANTITY + 1),
      ).toThrow(/must not exceed/);
    });

    it('accepts min and max boundaries', () => {
      expect(() =>
        assertValidTicketQuantity(TICKET_CONSTRAINTS.MIN_QUANTITY),
      ).not.toThrow();
      expect(() =>
        assertValidTicketQuantity(TICKET_CONSTRAINTS.MAX_QUANTITY),
      ).not.toThrow();
    });
  });

  describe('assertValidStroopsAmount', () => {
    it('rejects decimal / wrong asset precision', () => {
      expect(() => assertValidStroopsAmount('1.5')).toThrow(InvalidTicketPurchaseError);
      expect(() => assertValidStroopsAmount('1.5')).toThrow(/wrong asset precision/);
    });

    it('rejects empty and non-numeric strings', () => {
      expect(() => assertValidStroopsAmount('')).toThrow(InvalidTicketPurchaseError);
      expect(() => assertValidStroopsAmount('abc')).toThrow(InvalidTicketPurchaseError);
    });

    it('accepts integer stroops strings', () => {
      expect(() => assertValidStroopsAmount('0')).not.toThrow();
      expect(() => assertValidStroopsAmount('1000000')).not.toThrow();
    });
  });

  describe('validateBuyTicketInputs / validateBuyTicketsInputs', () => {
    it('validateBuyTicketInputs aggregates raffle + quantity checks', () => {
      expect(() => validateBuyTicketInputs({ raffleId: 0, quantity: 1 })).toThrow(
        InvalidTicketPurchaseError,
      );
      expect(() => validateBuyTicketInputs({ raffleId: 1, quantity: 0 })).toThrow(
        InvalidTicketPurchaseError,
      );
    });

    it('validateBuyTicketsInputs also checks maxPricePerTicket precision', () => {
      expect(() =>
        validateBuyTicketsInputs({
          raffleId: 1,
          count: 1,
          maxPricePerTicket: '1.0000001',
        }),
      ).toThrow(/wrong asset precision/);
    });
  });
});
