import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.service";

@Injectable()
export class TicketPurchasedHandler extends BaseEventHandler {
  constructor() {
    super("TicketPurchased");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const buyer = this.toString(topics[2]);
      const data = this.toNative(value);

      if (raffleId === null || buyer === null || !data) {
        this.logger.warn("Failed to parse TicketPurchased event: missing data");
        return null;
      }

      return {
        type: "TicketPurchased",
        raffle_id: raffleId,
        buyer: buyer,
        ticket_ids: data.ticket_ids.map(Number),
        total_paid: data.total_paid.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Error parsing TicketPurchased: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
