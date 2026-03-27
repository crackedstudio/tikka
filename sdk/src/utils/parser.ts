import { xdr, scValToNative } from '@stellar/stellar-sdk';

/**
 * TikkaEvent represents a parsed contract event.
 */
export interface TikkaEvent {
  type: string;
  raffleId: number;
  [key: string]: any;
}

/**
 * TransactionHistoryParser utility to extract and map domain events from 
 * Soroban transaction result metadata.
 */
export class TransactionHistoryParser {
  /**
   * Parses events from a transaction's result metadata.
   * 
   * @param resultMetaXdr Base64 encoded TransactionMeta XDR string.
   * @returns Array of parsed TikkaEvents.
   */
  static parseResult(resultMetaXdr: string): TikkaEvent[] {
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
      console.error('Failed to parse transaction metadata XDR:', error);
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
    if (topics.length === 0) return null;

    const eventName = scValToNative(topics[0]);
    const value = scValToNative(v0Body.data());

    // Basic mapping based on ARCHITECTURE.md and indexer implementation
    // Tikka events typically follow:
    // topics[0] = event_name
    // topics[1] = raffle_id (as u32 ScVal)
    // topics[2] = primary actor (creator/buyer/winner) - optional
    // value     = remaining params (as Map or Struct ScVal)

    switch (eventName) {
      case 'RaffleCreated':
        return {
          type: 'RaffleCreated',
          raffleId: Number(scValToNative(topics[1])),
          creator: scValToNative(topics[2]),
          ...value,
        };
      case 'TicketPurchased':
        return {
          type: 'TicketPurchased',
          raffleId: Number(scValToNative(topics[1])),
          buyer: scValToNative(topics[2]),
          ticketIds: value.ticket_ids?.map(Number) || [],
          totalPaid: value.total_paid?.toString(),
        };
      case 'RaffleCancelled':
        return {
          type: 'RaffleCancelled',
          raffleId: Number(scValToNative(topics[1])),
          reason: value.reason,
        };
      case 'TicketRefunded':
        return {
          type: 'TicketRefunded',
          raffleId: Number(scValToNative(topics[1])),
          ticketId: Number(scValToNative(topics[2])),
          recipient: value.recipient,
          amount: value.amount?.toString(),
        };
      case 'RaffleFinalized':
        return {
          type: 'RaffleFinalized',
          raffleId: Number(scValToNative(topics[1])),
          winner: scValToNative(topics[2]),
          winningTicketId: Number(value.winning_ticket_id),
          prizeAmount: value.prize_amount?.toString(),
        };
      default:
        // Generic handling for other Tikka events with raffleId in topics[1]
        const raffleId = topics.length > 1 ? Number(scValToNative(topics[1])) : undefined;
        if (raffleId !== undefined && !isNaN(raffleId)) {
          return {
            type: eventName,
            raffleId,
            ...(typeof value === 'object' ? value : { data: value }),
          };
        }
    }

    return null;
  }
}
