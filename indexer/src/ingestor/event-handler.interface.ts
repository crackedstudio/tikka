import { xdr } from "@stellar/stellar-sdk";
import { DomainEvent } from "./event.types";
import { RawSorobanEvent } from "./event-parser.service";

/**
 * Interface for event handlers
 * Each handler is responsible for parsing a specific event type
 */
export interface IEventHandler {
  /**
   * The event name this handler supports (e.g., "RaffleCreated")
   */
  readonly eventName: string;

  /**
   * Parse the raw event into a domain event
   * @param topics - Decoded XDR topics
   * @param value - Decoded XDR value
   * @param rawEvent - Original raw event for context
   * @returns Parsed domain event or null if parsing fails
   */
  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null;
}

/**
 * Contract configuration for event parsing
 */
export interface ContractConfig {
  /**
   * Contract address/ID
   */
  address: string;

  /**
   * Contract version (e.g., "v1", "v2")
   */
  version: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Whether this contract is enabled
   */
  enabled: boolean;

  /**
   * Custom event handlers for this contract
   * Maps event names to handler class names or instances
   */
  eventHandlers?: Record<string, string>;
}

/**
 * Event handler registry configuration
 */
export interface EventHandlerRegistry {
  /**
   * Registered contracts
   */
  contracts: ContractConfig[];

  /**
   * Default handlers to use when no custom handler is specified
   */
  defaultHandlers?: Record<string, string>;
}
