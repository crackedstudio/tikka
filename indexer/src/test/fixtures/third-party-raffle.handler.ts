import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "../../ingestor/handlers/base-event.handler";
import {
  EventPayload,
  RaffleCreatedEvent,
  DomainEvent,
} from "../../ingestor/event.types";
import { RawSorobanEvent } from "../../ingestor/event-parser.interface";
import { IEventHandler } from "../../ingestor/event-handler.interface";
import {
  asNumber,
  asRecord,
  pickBoolean,
  pickNumber,
  pickString,
  toNativeValue,
} from "../../ingestor/handlers/decode-utils";

@Injectable()
export class ThirdPartyRaffleCreatedHandler extends BaseEventHandler<RaffleCreatedEvent> {
  constructor() {
    super("RaffleCreated", "ThirdPartyRaffleCreatedHandler");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RaffleCreatedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const creator = this.toString(topics[2]);
    const category = this.toString(topics[3]);
    const params = this.toRecord(value);

    if (raffleId === null || creator === null || !params) {
      this.logger.warn("Failed to parse third-party RaffleCreated: missing data");
      return null;
    }

    const maxTickets = pickNumber(params, ["max_tickets"], 0);

    return {
      raffle_id: raffleId,
      creator: creator,
      params: {
        ticket_price: pickString(params, ["ticket_price", "price"], "0"),
        max_tickets: maxTickets,
        end_time: pickNumber(params, ["end_time", "endTime"], 0),
        asset: pickString(params, ["asset"], category ?? "XLM"),
        metadata_cid: JSON.stringify({
          category,
          metadata: asRecord(params.metadata ?? params.metadata_cid ?? params.metadataCid) ?? {},
        }),
        allow_multiple: pickBoolean(
          params,
          ["allow_multiple", "allowMultiple"],
          true,
        ),
      },
    };
  }
}

@Injectable()
export class ThirdPartyCustomEventHandler implements IEventHandler {
  readonly eventName = "CustomPrizeDistribution";
  private readonly logger = console;

  parse(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    const raffleId = asNumber(toNativeValue(topics[1]));
    if (raffleId === null) return null;
    this.logger.log(`Processing custom prize distribution for raffle ${raffleId}`);
    return null;
  }
}
