import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.service";

@Injectable()
export class RaffleFinalizedHandler extends BaseEventHandler {
  constructor() {
    super("RaffleFinalized");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const winner = this.toString(topics[2]);
      const data = this.toNative(value);

      if (raffleId === null || winner === null || !data) {
        this.logger.warn("Failed to parse RaffleFinalized event: missing data");
        return null;
      }

      return {
        type: "RaffleFinalized",
        raffle_id: raffleId,
        winner: winner,
        winning_ticket_id: Number(data.winning_ticket_id),
        prize_amount: data.prize_amount.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Error parsing RaffleFinalized: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
