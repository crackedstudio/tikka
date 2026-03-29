/**
 * Example: Third-party raffle contract handler
 * 
 * This demonstrates how to create a handler for a third-party contract
 * that has a different event schema than the default raffle contract.
 */

import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "../base-event.handler";
import { DomainEvent } from "../../event.types";
import { RawSorobanEvent } from "../../event-parser.service";

/**
 * Example: Third-party RaffleCreated event with different schema
 * 
 * Differences from default:
 * - Includes additional metadata field
 * - Uses different topic structure
 * - Has custom validation rules
 */
@Injectable()
export class ThirdPartyRaffleCreatedHandler extends BaseEventHandler {
  constructor() {
    super("RaffleCreated", "ThirdPartyRaffleCreatedHandler");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      // Third-party contract uses different topic structure
      // topics[1] = raffle_id
      // topics[2] = creator
      // topics[3] = category (additional field)
      
      const raffleId = this.toNumber(topics[1]);
      const creator = this.toString(topics[2]);
      const category = this.toString(topics[3]); // Third-party specific
      const params = this.toNative(value);

      if (raffleId === null || creator === null || !params) {
        this.logger.warn("Failed to parse third-party RaffleCreated: missing data");
        return null;
      }

      // Third-party contract has additional validation
      if (params.max_tickets > 10000) {
        this.logger.warn(`Third-party raffle ${raffleId} exceeds max ticket limit`);
        // Could return null or apply custom logic
      }

      // Map to standard DomainEvent format
      return {
        type: "RaffleCreated",
        raffle_id: raffleId,
        creator: creator,
        params: {
          price: Number(params.price),
          max_tickets: Number(params.max_tickets),
          // Include third-party specific fields in params
          category: category,
          metadata: params.metadata || {},
        },
      };
    } catch (error) {
      this.logger.error(
        `Error parsing third-party RaffleCreated: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

/**
 * Example: Custom event type from third-party contract
 */
@Injectable()
export class ThirdPartyCustomEventHandler extends BaseEventHandler {
  constructor() {
    super("CustomPrizeDistribution", "ThirdPartyCustomEventHandler");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) {
        return null;
      }

      // This is a custom event type that doesn't exist in the default contract
      // You would need to extend the DomainEvent type to include this
      this.logger.log(
        `Processing custom prize distribution for raffle ${raffleId}`,
      );

      // For now, we can log it or transform it to a known event type
      // In a real implementation, you'd extend the event types
      return null; // or map to existing event type
    } catch (error) {
      this.logger.error(`Error parsing CustomPrizeDistribution: ${error.message}`);
      return null;
    }
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
