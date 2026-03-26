import { xdr, scValToNative } from "@stellar/stellar-sdk";
import { Injectable, Logger } from "@nestjs/common";
import { DomainEvent } from "./event.types";

export interface RawSorobanEvent {
  type: string; // e.g. 'contract'
  topics: string[]; // base64 encoded XDR scVals
  value: string; // base64 encoded XDR scVal
}

@Injectable()
export class EventParserService {
  private readonly logger = new Logger(EventParserService.name);

  /**
   * Parses a raw Soroban event into a typed DomainEvent.
   * Returns null if the event is unsupported or malformed.
   */
  public parse(rawEvent: RawSorobanEvent): DomainEvent | null {
    if (rawEvent.type !== "contract") {
      return null;
    }

    try {
      const topics = rawEvent.topics.map((t) => xdr.ScVal.fromXDR(t, "base64"));
      const value = xdr.ScVal.fromXDR(rawEvent.value, "base64");

      if (topics.length === 0) return null;

      // topic[0] usually contains the event name (symbol)
      const eventName = scValToNative(topics[0]);

      switch (eventName) {
        case "RaffleCreated":
          return this.parseRaffleCreated(topics, value);
        case "TicketPurchased":
          return this.parseTicketPurchased(topics, value);
        case "DrawTriggered":
          return this.parseDrawTriggered(topics, value);
        case "RandomnessRequested":
          return this.parseRandomnessRequested(topics, value);
        case "RandomnessReceived":
          return this.parseRandomnessReceived(topics, value);
        case "RaffleFinalized":
          return this.parseRaffleFinalized(topics, value);
        case "RaffleCancelled":
          return this.parseRaffleCancelled(topics, value);
        case "TicketRefunded":
          return this.parseTicketRefunded(topics, value);
        default:
          this.logger.debug(`Unknown event type: ${eventName}`);
          return null;
      }
    } catch (e) {
      this.logger.warn(
        `Failed to parse event: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  private parseRaffleCreated(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    // Assuming topics[1] is raffle_id, topics[2] is creator
    // Assuming value is RaffleParams map/struct
    const raffleId = Number(scValToNative(topics[1]));
    const creator = scValToNative(topics[2]);
    const params = scValToNative(value);

    return {
      type: "RaffleCreated",
      raffle_id: raffleId,
      creator: creator,
      params: {
        price: Number(params.price),
        max_tickets: Number(params.max_tickets),
      },
    };
  }

  private parseTicketPurchased(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    // Assuming topics[1] = raffle_id, topics[2] = buyer
    // Assuming value is a map/struct with { ticket_ids, total_paid }
    const raffleId = Number(scValToNative(topics[1]));
    const buyer = scValToNative(topics[2]);
    const data = scValToNative(value);

    return {
      type: "TicketPurchased",
      raffle_id: raffleId,
      buyer: buyer,
      ticket_ids: data.ticket_ids.map(Number),
      total_paid: data.total_paid.toString(),
    };
  }

  private parseDrawTriggered(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "DrawTriggered",
      raffle_id: raffleId,
      ledger: Number(data.ledger),
    };
  }

  private parseRandomnessRequested(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RandomnessRequested",
      raffle_id: raffleId,
      request_id: Number(data.request_id),
    };
  }

  private parseRandomnessReceived(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RandomnessReceived",
      raffle_id: raffleId,
      seed: Buffer.from(data.seed).toString("hex"),
      proof: Buffer.from(data.proof).toString("hex"),
    };
  }

  private parseRaffleFinalized(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const winner = scValToNative(topics[2]);
    const data = scValToNative(value);

    return {
      type: "RaffleFinalized",
      raffle_id: raffleId,
      winner: winner,
      winning_ticket_id: Number(data.winning_ticket_id),
      prize_amount: data.prize_amount.toString(),
    };
  }

  private parseRaffleCancelled(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RaffleCancelled",
      raffle_id: raffleId,
      reason: data.reason,
    };
  }

  private parseTicketRefunded(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DomainEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const ticketId = Number(scValToNative(topics[2]));
    const data = scValToNative(value);

    return {
      type: "TicketRefunded",
      raffle_id: raffleId,
      ticket_id: ticketId,
      recipient: data.recipient,
      amount: data.amount.toString(),
    };
  }
}
