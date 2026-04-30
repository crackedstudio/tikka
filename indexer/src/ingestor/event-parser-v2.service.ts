import { xdr, scValToNative } from "@stellar/stellar-sdk";
import { Injectable, Logger } from "@nestjs/common";
import { DomainEvent } from "./event.types";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { RawSorobanEvent } from "./event-parser.service";

/**
 * Extensible Event Parser Service (V2)
 * Uses a dynamic registry system to support multiple contracts and custom event handlers
 */
@Injectable()
export class EventParserV2Service {
  private readonly logger = new Logger(EventParserV2Service.name);

  constructor(private readonly handlerRegistry: EventHandlerRegistry) {}

  /**
   * Parses a raw Soroban event into a typed DomainEvent.
   * Returns null if the event is unsupported or malformed.
   */
  public parse(rawEvent: RawSorobanEvent): DomainEvent | null {
    if (rawEvent.type !== "contract") {
      return null;
    }

    try {
      const topics = rawEvent.topics.map((t) => xdr.ScVal.fromXDR(t, "base64"));
      const value = xdr.ScVal.fromXDR(rawEvent.value, "base64");

      if (topics.length === 0) return null;

      // topic[0] usually contains the event name (symbol)
      const eventName = scValToNative(topics[0]);
      const schemaVersion = this.extractSchemaVersion(topics);
      const contractAddress = this.getContractAddress(rawEvent);

      // Use registry to parse the event
      const parsed = this.handlerRegistry.parseEvent(
        contractAddress,
        eventName,
        schemaVersion,
        topics,
        value,
        rawEvent,
      );

      if (!parsed) {
        // Check if this is from a known contract
        if (this.handlerRegistry.isContractRegistered(contractAddress)) {
          this.logger.debug(
            `[unhandled_supported] Event "${eventName}" from known contract ${contractAddress}`,
          );
        } else {
          this.logger.debug(
            `[unknown] Event "${eventName}" from unknown contract ${contractAddress}`,
          );
        }
      }

      return parsed;
    } catch (e) {
      this.logger.warn(
        `Failed to parse event: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  private extractSchemaVersion(topics: xdr.ScVal[]): number {
    if (topics.length < 2) {
      return 1;
    }

    try {
      const maybeVersion = Number(scValToNative(topics[1]));
      return Number.isFinite(maybeVersion) && maybeVersion > 0 ? maybeVersion : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Extract contract address from raw event
   * This may vary depending on your event structure
   */
  private getContractAddress(event: RawSorobanEvent): string {
    // Try to extract from event structure
    // Adjust based on your actual event format
    const contractId =
      (event as any).contractId || (event as any).address || "default";
    return contractId;
  }

  /**
   * Get registry for runtime management
   */
  public getRegistry(): EventHandlerRegistry {
    return this.handlerRegistry;
  }
}
