import { DomainEvent } from "./event.types";

/**
 * Raw Soroban contract event as delivered by Horizon, before decoding.
 *
 * This is the canonical shape consumed by the parser and every event handler.
 * It previously lived in `event-parser.service.ts` (the legacy V1 parser);
 * it now lives here so that the chosen parser and all handlers depend on the
 * parser *contract* rather than on a concrete implementation.
 */
export interface RawSorobanEvent {
  /** Event category, e.g. `"contract"`. Non-contract events are ignored. */
  type: string;
  /** Base64-encoded XDR `ScVal`s. `topics[0]` is the event name (symbol). */
  topics: string[];
  /** Base64-encoded XDR `ScVal` payload. */
  value: string;
  /** Address of the contract that emitted the event. */
  contractId?: string;
}

/**
 * The single parser contract used by the ingestion pipeline.
 *
 * Implemented by {@link EventParserV2Service}. Ingestion services depend on
 * this interface (via the {@link EVENT_PARSER} token) rather than on a concrete
 * parser, so the decoding implementation can evolve without touching callers.
 *
 * Contract:
 * - Returns a typed {@link DomainEvent} for a supported, well-formed contract
 *   event.
 * - Returns `null` (never throws) for non-contract events, malformed XDR,
 *   unknown event symbols, or events from unregistered contracts.
 */
export interface IEventParser {
  parse(rawEvent: RawSorobanEvent): DomainEvent | null;
}

/**
 * DI token for {@link IEventParser}. Bound to {@link EventParserV2Service}.
 * Inject with `@Inject(EVENT_PARSER)` to depend on the parser contract.
 */
export const EVENT_PARSER = Symbol("EVENT_PARSER");
