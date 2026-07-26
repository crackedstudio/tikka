import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

@Injectable()
export class RaffleCancelledHandler extends BaseEventHandler {
  constructor() {
    super("RaffleCancelled");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) {
        this.logger.warn("Failed to parse RaffleCancelled event: missing data");
        return null;
      }

      return {
        type: "RaffleCancelled",
        schemaVersion: this.schemaVersion(rawEvent),
        raffle_id: raffleId,
        reason: data.reason,
      };
    } catch (error) {
      this.logger.error(
        `Error parsing RaffleCancelled: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
