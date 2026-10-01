import { xdr, scValToNative } from '@stellar/stellar-sdk';
import { defaultLogger, type TikkaLogger } from './logger';

/**
 * TikkaEvent represents a parsed contract event.
 *
 * Every event produced by {@link TransactionHistoryParser} is fully populated:
 * `type` is a non-empty string and `raffleId` is a finite, non-negative
 * integer. Inputs that cannot satisfy that contract are dropped instead of
 * being emitted as a partially populated object (e.g. `raffleId: NaN`).
 */
export interface TikkaEvent {
  type: string;
  raffleId: number;
  [key: string]: any;
}

/** Narrows a decoded Soroban value to a plain record (never a primitive). */
function asRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' ? (value as Record<string, any>) : {};
}

/**
 * Coerces a decoded topic value into a valid raffle id.
 *
 * Returns `null` for anything that is not a finite, non-negative integer so the
 * caller can drop the event rather than emit `raffleId: NaN` (or coerce a
 * string/bool into an unrelated numeric id).
 */
function toRaffleId(value: unknown): number | null {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * TransactionHistoryParser utility to extract and map domain events from
 * Soroban transaction result metadata.
 */
export class TransactionHistoryParser {
  /**
   * Parses events from a transaction's result metadata.
   *
   * Total: never throws. Malformed metadata yields an empty array, and
   * individual malformed events are skipped rather than partially decoded.
   *
   * @param resultMetaXdr Base64 encoded TransactionMeta XDR string.
   * @param logger Optional logger for error reporting.
   * @returns Array of parsed TikkaEvents.
   */
  static parseResult(resultMetaXdr: string, logger: TikkaLogger = defaultLogger): TikkaEvent[] {
    if (!resultMetaXdr) return [];

    try {
      const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, 'base64');
      const events: TikkaEvent[] = [];

      // Soroban meta is in v3 arm. Check by arm name to bypass type complexities.
      if ((meta as any).arm() !== 'v3') {
        return [];
      }

      const sorobanMeta = (meta as any).v3().sorobanMeta();
      if (!sorobanMeta) return [];

      const contractEvents = sorobanMeta.events();
      for (const event of contractEvents) {
        const parsed = this.parseContractEvent(event);
        if (parsed) {
          events.push(parsed);
        }
      }

      return events;
    } catch (error) {
      logger.error('Failed to parse transaction metadata XDR:', error);
      return [];
    }
  }

  /**
   * Internal helper to parse a single ContractEvent XDR.
   */
  private static parseContractEvent(event: xdr.ContractEvent): TikkaEvent | null {
    const body = event.body();
    // Only v0 is currently used for Soroban events. Access arm() safely.
    if ((body as any).arm() !== 'v0') return null;

    const v0Body = (body as any).v0();
    const topics = v0Body.topics() as xdr.ScVal[];
    if (!Array.isArray(topics) || topics.length === 0) return null;

    const eventName = scValToNative(topics[0]);
    // A non-string topic cannot be an event name — drop it rather than emit an
    // event whose `type` violates the TikkaEvent contract.
    if (typeof eventName !== 'string' || eventName.length === 0) return null;

    const value = scValToNative(v0Body.data());
    const record = asRecord(value);

    // Tikka events typically follow:
    // topics[0] = event_name
    // topics[1] = raffle_id (as u32 ScVal)
    // topics[2] = primary actor (creator/buyer/winner) - optional
    // value     = remaining params (as Map or Struct ScVal)
    const raffleId = topics.length > 1 ? toRaffleId(scValToNative(topics[1])) : null;

    switch (eventName) {
      case 'RaffleCreated': {
        if (raffleId === null) return null;
        return {
          ...record,
          type: 'RaffleCreated',
          raffleId,
          creator: scValToNative(topics[2]),
        };
      }
      case 'TicketPurchased': {
        if (raffleId === null) return null;
        return {
          ...record,
          type: 'TicketPurchased',
          raffleId,
          buyer: scValToNative(topics[2]),
          ticketIds: Array.isArray(record.ticket_ids)
            ? record.ticket_ids.map(Number).filter((n: number) => Number.isInteger(n))
            : [],
          totalPaid: record.total_paid?.toString(),
        };
      }
      case 'RaffleCancelled': {
        if (raffleId === null) return null;
        return {
          ...record,
          type: 'RaffleCancelled',
          raffleId,
          reason: record.reason,
        };
      }
      case 'TicketRefunded': {
        if (raffleId === null) return null;
        const ticketId = toRaffleId(scValToNative(topics[2]));
        if (ticketId === null) return null;
        return {
          ...record,
          type: 'TicketRefunded',
          raffleId,
          ticketId,
          recipient: record.recipient,
          amount: record.amount?.toString(),
        };
      }
      case 'RaffleFinalized': {
        if (raffleId === null) return null;
        const winningTicketId = toRaffleId(record.winning_ticket_id);
        if (winningTicketId === null) return null;
        return {
          ...record,
          type: 'RaffleFinalized',
          raffleId,
          winner: scValToNative(topics[2]),
          winningTicketId,
          prizeAmount: record.prize_amount?.toString(),
        };
      }
      default: {
        // Generic handling for other Tikka events with raffleId in topics[1].
        if (raffleId === null) return null;
        return {
          ...record,
          type: eventName,
          raffleId,
        };
      }
    }
  }
}
