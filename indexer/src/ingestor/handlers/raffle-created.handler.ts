import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

@Injectable()
export class RaffleCreatedHandler extends BaseEventHandler {
  constructor() {
    super("RaffleCreated");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      // Assuming topics[1] is raffle_id, topics[2] is creator
      // Assuming value is RaffleParams map/struct
      const raffleId = this.toNumber(topics[1]);
      const creator = this.toString(topics[2]);
      const params = this.toNative(value);

      if (raffleId === null || creator === null || !params) {
        this.logger.warn("Failed to parse RaffleCreated event: missing data");
        return null;
      }

      const p = params as Record<string, unknown>;
      return {
        type: "RaffleCreated",
        raffle_id: raffleId,
        creator: creator,
        params: {
          ticket_price: String(p.ticket_price ?? p.price ?? "0"),
          max_tickets: Number(p.max_tickets),
          end_time: Number(p.end_time ?? p.endTime ?? 0),
          asset: String(p.asset ?? "XLM"),
          metadata_cid: String(p.metadata_cid ?? p.metadataCid ?? ""),
          allow_multiple: Boolean(p.allow_multiple ?? p.allowMultiple ?? true),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error parsing RaffleCreated: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
