import { xdr, scValToNative } from '@stellar/stellar-sdk';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import type { RaffleData, UserParticipation } from './generated/bindings';

/**
 * Parse and validate a SCVal as a number (u32/i32).
 * Throws TikkaSdkError on mismatch.
 */
export function parseNumber(scVal: xdr.ScVal, label: string): number {
  const native = scValToNative(scVal);
  if (typeof native !== 'number' || !Number.isInteger(native)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected integer for "${label}", got ${typeof native}: ${String(native)}`,
    );
  }
  return native;
}

/**
 * Parse and validate a SCVal as a string.
 * Throws TikkaSdkError on mismatch.
 */
export function parseString(scVal: xdr.ScVal, label: string): string {
  const native = scValToNative(scVal);
  if (typeof native !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected string for "${label}", got ${typeof native}`,
    );
  }
  return native;
}

/**
 * Parse and validate a SCVal as a boolean.
 * Throws TikkaSdkError on mismatch.
 */
export function parseBoolean(scVal: xdr.ScVal, label: string): boolean {
  const native = scValToNative(scVal);
  if (typeof native !== 'boolean') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected boolean for "${label}", got ${typeof native}`,
    );
  }
  return native;
}

/**
 * Parse and validate a SCVal as an array of numbers.
 * Throws TikkaSdkError on mismatch.
 */
export function parseNumberArray(scVal: xdr.ScVal, label: string): number[] {
  const native = scValToNative(scVal);
  if (!Array.isArray(native)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected array for "${label}", got ${typeof native}`,
    );
  }
  for (let i = 0; i < native.length; i++) {
    if (typeof native[i] !== 'number' || !Number.isInteger(native[i])) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Expected integer array for "${label}", element ${i} is ${typeof native[i]}`,
      );
    }
  }
  return native;
}

/**
 * Parse and validate a SCVal as a RaffleData struct.
 * Throws TikkaSdkError on mismatch.
 */
export function parseRaffleData(scVal: xdr.ScVal, label: string): RaffleData {
  const native = scValToNative(scVal);
  if (typeof native !== 'object' || native === null || Array.isArray(native)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected RaffleData object for "${label}", got ${typeof native}`,
    );
  }
  const data = native as Record<string, unknown>;
  if (typeof data.id !== 'number' || !Number.isInteger(data.id)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.id must be an integer for "${label}"`,
    );
  }
  if (typeof data.creator !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.creator must be a string for "${label}"`,
    );
  }
  if (typeof data.metadata_id !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.metadata_id must be a string for "${label}"`,
    );
  }
  if (typeof data.ticket_price !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.ticket_price must be a string for "${label}"`,
    );
  }
  if (typeof data.total_tickets !== 'number' || !Number.isInteger(data.total_tickets)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.total_tickets must be an integer for "${label}"`,
    );
  }
  if (typeof data.tickets_sold !== 'number' || !Number.isInteger(data.tickets_sold)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.tickets_sold must be an integer for "${label}"`,
    );
  }
  if (typeof data.end_time !== 'number' || !Number.isInteger(data.end_time)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.end_time must be an integer for "${label}"`,
    );
  }
  if (typeof data.is_active !== 'boolean') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.is_active must be a boolean for "${label}"`,
    );
  }
  if (data.winner !== null && typeof data.winner !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.winner must be string or null for "${label}"`,
    );
  }
  if (typeof data.prize_distributed !== 'boolean') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `RaffleData.prize_distributed must be a boolean for "${label}"`,
    );
  }
  return native as RaffleData;
}

/**
 * Parse and validate a SCVal as a UserParticipation struct.
 * Throws TikkaSdkError on mismatch.
 */
export function parseUserParticipation(scVal: xdr.ScVal, label: string): UserParticipation {
  const native = scValToNative(scVal);
  if (typeof native !== 'object' || native === null || Array.isArray(native)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected UserParticipation object for "${label}", got ${typeof native}`,
    );
  }
  const data = native as Record<string, unknown>;
  if (typeof data.raffle_id !== 'number' || !Number.isInteger(data.raffle_id)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `UserParticipation.raffle_id must be an integer for "${label}"`,
    );
  }
  if (typeof data.user_address !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `UserParticipation.user_address must be a string for "${label}"`,
    );
  }
  if (typeof data.tickets_purchased !== 'number' || !Number.isInteger(data.tickets_purchased)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `UserParticipation.tickets_purchased must be an integer for "${label}"`,
    );
  }
  if (typeof data.total_spent !== 'string') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `UserParticipation.total_spent must be a string for "${label}"`,
    );
  }
  if (typeof data.participation_time !== 'number' || !Number.isInteger(data.participation_time)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `UserParticipation.participation_time must be an integer for "${label}"`,
    );
  }
  return native as UserParticipation;
}

/**
 * Parse and validate a SCVal as void (undefined).
 * Throws TikkaSdkError on mismatch.
 */
export function parseVoid(scVal: xdr.ScVal, label: string): void {
  const native = scValToNative(scVal);
  if (native !== undefined) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Expected void for "${label}", got ${typeof native}`,
    );
  }
}