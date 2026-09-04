/**
 * Example: Third-party raffle contract handlers
 *
 * This demonstrates how to create handlers for a third-party contract
 * that has a different event schema than the default raffle contract.
 */

import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "../base-event.handler";
import {
  EventPayload,
  RaffleCreatedEvent,
} from "../../event.types";
import { RawSorobanEvent } from "../../event-parser.interface";
import { IEventHandler } from "../../event-handler.interface";
import { DomainEvent } from "../../event.types";
import {
  asNumber,
  asRecord,
  pickBoolean,
  pickNumber,
  pickString,
  toNativeValue,
} from "../decode-utils";

/**
 * Example: Third-party RaffleCreated event with a different schema.
 *
 * Differences from the default contract:
 * - Includes an additional topic slot (category)
 * - Uses its own validation rules
 *
 * The decoded output is still a first-party `RaffleCreatedEvent`, so the
 * handler is typed against the union — `BaseEventHandler<RaffleCreatedEvent>`
 * checks the payload at compile time and stamps `type` + `schemaVersion`.
 */
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
    // Third-party contract topic layout:
    // topics[1] = raffle_id, topics[2] = creator, topics[3] = category
    const raffleId = this.toNumber(topics[1]);
    const creator = this.toString(topics[2]);
    const category = this.toString(topics[3]); // third-party specific
    const params = this.toRecord(value);

    if (raffleId === null || creator === null || !params) {
      this.logger.warn("Failed to parse third-party RaffleCreated: missing data");
      return null;
    }

    // Third-party contract has additional validation
    const maxTickets = pickNumber(params, ["max_tickets"], 0);
    if (maxTickets > 10000) {
      this.logger.warn(`Third-party raffle ${raffleId} exceeds max ticket limit`);
      // Could return null or apply custom logic
    }

    // Map to the standard RaffleCreatedEvent params; stash third-party fields
    // in metadata_cid as JSON.
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

/**
 * Example: a custom event that only exists on a third-party contract.
 *
 * First-party events live in the `ContractEventPayloadMap` union and are
 * handled by extending `BaseEventHandler<ThatEvent>`. For an event that is
 * *not* part of the union (like this one), implement `IEventHandler`
 * directly — the registry routes by the string event name — and either map
 * it onto a known event type or return `null` until the event is promoted
 * into the union (add it to `ContractEventPayloadMap`; the exhaustive
 * switches in the dispatcher then force it to be handled).
 */
@Injectable()
export class ThirdPartyCustomEventHandler implements IEventHandler {
  readonly eventName = "CustomPrizeDistribution";

  private readonly logger = console;

  parse(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    // Decode with the same typed primitives the base class uses.
    const raffleId = asNumber(toNativeValue(topics[1]));

    if (raffleId === null) {
      return null;
    }

    this.logger.log(
      `Processing custom prize distribution for raffle ${raffleId}`,
    );

    // Nothing to map onto yet — promote the event into
    // `ContractEventPayloadMap` to give it a first-class typed handler.
    return null;
  }
}

/**
 * Example configuration for third-party contract:
 *
 * Add to config/event-handlers.json:
 *
 * {
 *   "contracts": [
 *     {
 *       "address": "THIRD_PARTY_CONTRACT_ADDRESS",
 *       "version": "v1",
 *       "description": "Third-party raffle platform",
 *       "enabled": true,
 *       "eventHandlers": {
 *         "RaffleCreated": "ThirdPartyRaffleCreatedHandler",
 *         "CustomPrizeDistribution": "ThirdPartyCustomEventHandler"
 *       }
 *     }
 *   ]
 * }
 */
