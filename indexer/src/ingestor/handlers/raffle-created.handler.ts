import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { EventPayload, RaffleCreatedEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { pickBoolean, pickNumber, pickString } from "./decode-utils";

/**
 * Decodes `RaffleCreated` events.
 *
 * Wire layout: topics = [RaffleCreated, raffle_id, creator],
 * value = RaffleParams map (snake_case, with legacy camelCase spellings
 * still honoured so events emitted by older contract builds keep parsing).
 */
@Injectable()
export class RaffleCreatedHandler extends BaseEventHandler<RaffleCreatedEvent> {
  constructor() {
    super("RaffleCreated");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RaffleCreatedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const creator = this.toString(topics[2]);
    const params = this.toRecord(value);

    if (raffleId === null || creator === null || !params) {
      this.logger.warn("Failed to parse RaffleCreated event: missing data");
      return null;
    }

    return {
      raffle_id: raffleId,
      creator: creator,
      params: {
        ticket_price: pickString(params, ["ticket_price", "price"], "0"),
        max_tickets: pickNumber(params, ["max_tickets"], 0),
        end_time: pickNumber(params, ["end_time", "endTime"], 0),
        asset: pickString(params, ["asset"], "XLM"),
        metadata_cid: pickString(params, ["metadata_cid", "metadataCid"], ""),
        allow_multiple: pickBoolean(
          params,
          ["allow_multiple", "allowMultiple"],
          true,
        ),
      },
    };
  }
}