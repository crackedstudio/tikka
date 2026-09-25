import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';
import { TICKET_CONSTRAINTS } from './ticket.types';

/** Fields that can fail ticket-purchase input validation. */
export type TicketPurchaseField =
  | 'raffleId'
  | 'quantity'
  | 'count'
  | 'maxPricePerTicket'
  | 'purchases';

/**
 * Typed validation error for ticket purchase inputs.
 * Thrown at the module boundary before any network call or tx build.
 */
export class InvalidTicketPurchaseError extends TikkaSdkError {
  constructor(
    public readonly field: TicketPurchaseField,
    message: string,
    cause?: unknown,
  ) {
    super(TikkaSdkErrorCode.ValidationError, message, cause);
    this.name = 'InvalidTicketPurchaseError';
    Object.setPrototypeOf(this, InvalidTicketPurchaseError.prototype);
  }
}

/**
 * Validates raffle id is a positive safe integer.
 * Rejects 0, negative, non-integer, NaN, and Infinity.
 */
export function assertValidRaffleId(raffleId: number, fieldName: TicketPurchaseField = 'raffleId'): void {
  if (typeof raffleId !== 'number' || Number.isNaN(raffleId) || !Number.isFinite(raffleId)) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be a finite number, got ${raffleId}`,
    );
  }
  if (!Number.isInteger(raffleId) || raffleId <= 0 || !Number.isSafeInteger(raffleId)) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be a positive integer, got ${raffleId}`,
    );
  }
}

/**
 * Validates ticket quantity / count against module constraints.
 * Covers 0, negative, non-integer, and max boundary.
 */
export function assertValidTicketQuantity(
  quantity: number,
  fieldName: 'quantity' | 'count' = 'quantity',
): void {
  if (typeof quantity !== 'number' || Number.isNaN(quantity) || !Number.isFinite(quantity)) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be a finite number, got ${quantity}`,
    );
  }
  if (!Number.isInteger(quantity)) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be an integer, got ${quantity}`,
    );
  }
  if (quantity < TICKET_CONSTRAINTS.MIN_QUANTITY) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be at least ${TICKET_CONSTRAINTS.MIN_QUANTITY}, got ${quantity}`,
    );
  }
  if (quantity > TICKET_CONSTRAINTS.MAX_QUANTITY) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must not exceed ${TICKET_CONSTRAINTS.MAX_QUANTITY}, got ${quantity}`,
    );
  }
}

/**
 * Validates a price expressed in stroops (integer asset amount).
 * Rejects decimals / wrong asset precision, empty, negative, and non-numeric values.
 */
export function assertValidStroopsAmount(
  amount: string,
  fieldName: TicketPurchaseField = 'maxPricePerTicket',
): void {
  if (typeof amount !== 'string' || amount.trim() === '') {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be a non-empty stroops integer string`,
    );
  }
  // Stroops are whole units — decimal strings indicate wrong asset precision.
  if (!/^\d+$/.test(amount)) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must be a non-negative integer stroops string (wrong asset precision): "${amount}"`,
    );
  }
  if (amount !== '0' && amount.startsWith('0')) {
    throw new InvalidTicketPurchaseError(
      fieldName,
      `${fieldName} must not have leading zeros: "${amount}"`,
    );
  }
}

/**
 * Module-boundary validation for a single `buy` purchase.
 * Must run before any simulate/invoke so invalid inputs never build transactions.
 */
export function validateBuyTicketInputs(params: {
  raffleId: number;
  quantity: number;
}): void {
  assertValidRaffleId(params.raffleId);
  assertValidTicketQuantity(params.quantity, 'quantity');
}

/**
 * Module-boundary validation for `buyTickets` (batch entry with price ceiling).
 */
export function validateBuyTicketsInputs(params: {
  raffleId: number;
  count: number;
  maxPricePerTicket: string;
}): void {
  assertValidRaffleId(params.raffleId);
  assertValidTicketQuantity(params.count, 'count');
  assertValidStroopsAmount(params.maxPricePerTicket, 'maxPricePerTicket');
}
