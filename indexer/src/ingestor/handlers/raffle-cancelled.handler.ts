import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { EventPayload, RaffleCancelledEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { asString } from "./decode-utils";

/**
 * Decodes `RaffleCancelled` events.
 *
 * Wire layout: topics = [RaffleCancelled, raffle_id], value = { reason }.
 */
@Injectable()
export class RaffleCancelledHandler extends BaseEventHandler<RaffleCancelledEvent> {
  constructor() {
    super("RaffleCancelled");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RaffleCancelledEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const data = this.toRecord(value);

    if (raffleId === null || !data) {
      this.logger.warn("Failed to parse RaffleCancelled event: missing data");
      return null;
    }

    return {
      raffle_id: raffleId,
      reason: asString(data.reason) ?? "",
    };
  }
}
