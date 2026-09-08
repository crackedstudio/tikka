import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { EventPayload, TicketPurchasedEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { asNumberArray, asString } from "./decode-utils";

/**
 * Decodes `TicketPurchased` events.
 *
 * Wire layout: topics = [TicketPurchased, raffle_id, buyer],
 * value = { ticket_ids: number[], total_paid: string }.
 */
@Injectable()
export class TicketPurchasedHandler extends BaseEventHandler<TicketPurchasedEvent> {
  constructor() {
    super("TicketPurchased");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<TicketPurchasedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const buyer = this.toString(topics[2]);
    const data = this.toRecord(value);

    if (raffleId === null || buyer === null || !data) {
      this.logger.warn("Failed to parse TicketPurchased event: missing data");
      return null;
    }

    const ticketIds = asNumberArray(data.ticket_ids ?? data.ticketIds);
    if (ticketIds === null) {
      this.logger.warn("Failed to parse TicketPurchased event: ticket_ids");
      return null;
    }

    return {
      raffle_id: raffleId,
      buyer: buyer,
      ticket_ids: ticketIds,
      total_paid: asString(data.total_paid ?? data.totalPaid) ?? "0",
    };
  }
}

