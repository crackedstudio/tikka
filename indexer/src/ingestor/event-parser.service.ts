import { xdr, scValToNative } from "@stellar/stellar-sdk";
import { Injectable, Logger } from "@nestjs/common";
import {
  DomainEvent,
  RaffleCreatedEvent,
  TicketPurchasedEvent,
  DrawTriggeredEvent,
  RandomnessRequestedEvent,
  RandomnessReceivedEvent,
  RaffleFinalizedEvent,
  RaffleCancelledEvent,
  TicketRefundedEvent,
} from "./event.types";

// Version map for contract addresses
const CONTRACT_VERSION_MAP: Record<string, "v1" | "v2"> = {
  // Example test mapping for v2 contracts used in unit tests
  V2_TEST_CONTRACT: "v2",
  // '0xNewContract': 'v2'
};

export interface RawSorobanEvent {
  type: string; // e.g. 'contract'
  topics: string[]; // base64 encoded XDR scVals
  value: string; // base64 encoded XDR scVal
  contractId?: string; // The address of the contract that emitted the event
}

@Injectable()
export class EventParserService {
  private readonly logger = new Logger(EventParserService.name);

  /**
   * Parses a raw Soroban event into a typed DomainEvent.
   * Returns null if the event is unsupported or malformed.
   */

  public parse(rawEvent: RawSorobanEvent): DomainEvent | null {
    const contractId = this.getContractId(rawEvent);
    const version = this.getVersion(contractId);
    if (version === "v2") {
      return this.parseV2(rawEvent);
    }
    return this.parseV1(rawEvent);
  }

  // Extract contractId from event (adjust as needed for your event structure)
  private getContractId(event: any): string {
    // If contractId is not present, return empty string
    return event.contractId || event.address || "";
  }

  // Version detection logic
  private getVersion(contractId: string): "v1" | "v2" {
    return CONTRACT_VERSION_MAP[contractId] || "v1";
  }

  // Existing parse logic, moved here with NO changes
  private parseV1(rawEvent: RawSorobanEvent): DomainEvent | null {
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
        case "ContractPaused":
          return this.parseContractPaused(topics);
        case "ContractUnpaused":
          return this.parseContractUnpaused(topics);
        case "AdminTransferProposed":
          return this.parseAdminTransferProposed(topics);
        case "AdminTransferAccepted":
          return this.parseAdminTransferAccepted(topics);
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

  // Minimal V2 override (extend only if schema changes)
  private parseV2(rawEvent: RawSorobanEvent): DomainEvent | null {
    // By default, fallback to V1 logic
    const parsed = this.parseV1(rawEvent);
    // If V2 schema changes, override fields here
    return parsed;
  }

  private parseRaffleCreated(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): RaffleCreatedEvent {
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
        ticket_price: (params.ticket_price || params.price || 0).toString(),
        max_tickets: Number(params.max_tickets || params.maxTickets || 0),
        end_time: Number(params.end_time || params.endTime || 0),
        asset: params.asset || "XLM",
        metadata_cid: params.metadata_cid || params.metadataCid || "",
        allow_multiple: !!(params.allow_multiple ?? params.allowMultiple ?? true),
      },
    };
  }

  private parseTicketPurchased(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): TicketPurchasedEvent {
    // Assuming topics[1] = raffle_id, topics[2] = buyer
    // Assuming value is a map/struct with { ticket_ids, total_paid }
    const raffleId = Number(scValToNative(topics[1]));
    const buyer = scValToNative(topics[2]);
    const data = scValToNative(value);

    return {
      type: "TicketPurchased",
      raffle_id: raffleId,
      buyer: buyer,
      ticket_ids: (data.ticket_ids || []).map(Number),
      total_paid: (data.total_paid || 0).toString(),
    };
  }

  private parseDrawTriggered(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): DrawTriggeredEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "DrawTriggered",
      raffle_id: raffleId,
      ledger: Number(data.ledger || 0),
    };
  }

  private parseRandomnessRequested(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): RandomnessRequestedEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RandomnessRequested",
      raffle_id: raffleId,
      request_id: Number(data.request_id || 0),
    };
  }

  private parseRandomnessReceived(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): RandomnessReceivedEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RandomnessReceived",
      raffle_id: raffleId,
      seed: data.seed ? Buffer.from(data.seed).toString("hex") : "",
      proof: data.proof ? Buffer.from(data.proof).toString("hex") : "",
    };
  }

  private parseRaffleFinalized(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): RaffleFinalizedEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const winner = scValToNative(topics[2]);
    const data = scValToNative(value);

    return {
      type: "RaffleFinalized",
      raffle_id: raffleId,
      winner: winner,
      winning_ticket_id: Number(data.winning_ticket_id || 0),
      prize_amount: (data.prize_amount || 0).toString(),
    };
  }

  private parseRaffleCancelled(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): RaffleCancelledEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const data = scValToNative(value);

    return {
      type: "RaffleCancelled",
      raffle_id: raffleId,
      reason: data.reason ?? "Unknown reason",
    };
  }

  private parseTicketRefunded(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
  ): TicketRefundedEvent {
    const raffleId = Number(scValToNative(topics[1]));
    const ticketId = Number(scValToNative(topics[2]));
    const data = scValToNative(value);

    return {
      type: "TicketRefunded",
      raffle_id: raffleId,
      ticket_id: ticketId,
      recipient: data.recipient || "",
      amount: (data.amount || 0).toString(),
    };
  }

  private parseContractPaused(topics: xdr.ScVal[]): DomainEvent {
    const admin = scValToNative(topics[1]);
    return { type: "ContractPaused", admin };
  }

  private parseContractUnpaused(topics: xdr.ScVal[]): DomainEvent {
    const admin = scValToNative(topics[1]);
    return { type: "ContractUnpaused", admin };
  }

  private parseAdminTransferProposed(topics: xdr.ScVal[]): DomainEvent {
    const currentAdmin = scValToNative(topics[1]);
    const proposedAdmin = scValToNative(topics[2]);
    return {
      type: "AdminTransferProposed",
      current_admin: currentAdmin,
      proposed_admin: proposedAdmin,
    };
  }

  private parseAdminTransferAccepted(topics: xdr.ScVal[]): DomainEvent {
    const oldAdmin = scValToNative(topics[1]);
    const newAdmin = scValToNative(topics[2]);
    return {
      type: "AdminTransferAccepted",
      old_admin: oldAdmin,
      new_admin: newAdmin,
    };
  }
}
