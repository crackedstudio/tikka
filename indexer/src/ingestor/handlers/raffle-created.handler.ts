import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.service";

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

      return {
        type: "RaffleCreated",
        raffle_id: raffleId,
        creator: creator,
        params: {
          price: Number(params.price),
          max_tickets: Number(params.max_tickets),
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
