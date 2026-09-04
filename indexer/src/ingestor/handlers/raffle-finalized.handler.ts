import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { EventPayload, RaffleFinalizedEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { asNumber, asString } from "./decode-utils";

/**
 * Decodes `RaffleFinalized` events.
 *
 * Wire layout: topics = [RaffleFinalized, raffle_id, winner],
 * value = { winning_ticket_id, prize_amount }.
 */
@Injectable()
export class RaffleFinalizedHandler extends BaseEventHandler<RaffleFinalizedEvent> {
  constructor() {
    super("RaffleFinalized");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RaffleFinalizedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const winner = this.toString(topics[2]);
    const data = this.toRecord(value);

    if (raffleId === null || winner === null || !data) {
      this.logger.warn("Failed to parse RaffleFinalized event: missing data");
      return null;
    }

    return {
      raffle_id: raffleId,
      winner: winner,
      winning_ticket_id: asNumber(data.winning_ticket_id) ?? 0,
      prize_amount: asString(data.prize_amount) ?? "0",
    };
  }
}
