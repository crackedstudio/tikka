/**
 * Discriminated union of every Soroban contract event the indexer can decode.
 *
 * ## Discriminant: the event topic
 *
 * Soroban contract events carry the event name as the symbol in `topics[0]`.
 * That topic is the discriminant of this union: every variant below is keyed
 * by its contract event topic (`type: "RaffleCreated"`, …), and
 * {@link CONTRACT_EVENT_TOPICS} is the exhaustive runtime list of topics.
 *
 * ## Single source of truth for the shapes
 *
 * The payload shapes in {@link ContractEventPayloadMap} are the *interim*
 * canonical reference, mirroring the contract ABI documented in
 * `sdk/src/contract/bindings.ts`. Once the SDK ships machine-generated
 * contract bindings (`stellar contract bindings typescript … --output-dir
 * ./src/contract/generated`, see the header comment in
 * `sdk/src/contract/bindings.ts`), re-point the entries of
 * {@link ContractEventPayloadMap} at those generated types instead of
 * re-declaring the shapes here a second time. The map is the only seam:
 * handlers, the dispatcher and the tests all derive from it.
 *
 * ## Schema versioning
 *
 * Every variant carries a required `schemaVersion` resolved by
 * `handlers/schema-version.ts` (`resolveSchemaVersion`), which defaults
 * legacy events — emitted before contracts stamped an explicit version — to
 * v1. The parser stamps the version once (see `BaseEventHandler.parse`), so
 * old events still parse and unsupported versions are dead-lettered
 * downstream with `SCHEMA_UNSUPPORTED` rather than silently mis-parsed.
 *
 * ## Exhaustiveness
 *
 * The union is closed: adding a topic to {@link ContractEventPayloadMap} /
 * {@link ContractEventTopic} extends this union, which forces a compile error
 * in every exhaustive switch over it (see `IngestionDispatcherService.applyEvent`
 * and the `Record<ContractEventTopic, …>` default-handler map in
 * `event-handlers.module.ts`) until the new event is actually handled.
 */

/** The contract event topic (the symbol in `topics[0]`) of every known event. */
export const CONTRACT_EVENT_TOPICS = [
  "RaffleCreated",
  "TicketPurchased",
  "DrawTriggered",
  "RandomnessRequested",
  "RandomnessReceived",
  "RaffleFinalized",
  "RaffleCancelled",
  "TicketRefunded",
  "ContractPaused",
  "ContractUnpaused",
  "AdminTransferProposed",
  "AdminTransferAccepted",
] as const;

/** Union of all contract event topics — the discriminant of {@link DomainEvent}. */
export type ContractEventTopic = (typeof CONTRACT_EVENT_TOPICS)[number];

/**
 * Raffle parameters carried on a `RaffleCreated` event (`value` map).
 * Mirrors the contract's `RaffleParams` struct.
 */
export interface RaffleParams {
  ticket_price: string;
  max_tickets: number;
  end_time: number;
  asset: string;
  metadata_cid: string;
  allow_multiple: boolean;
}

/**
 * Decoded payload of each contract event, keyed by its topic.
 *
 * Entries describe only the *payload* fields; the `type` discriminant and the
 * `schemaVersion` tag are added structurally by {@link DomainEvent}. Each
 * entry documents the wire layout it decodes from (topic slots + value).
 * This map is the seam to swap in the SDK's generated contract bindings.
 */
export interface ContractEventPayloadMap {
  /** topics: [RaffleCreated, raffle_id, creator]; value: RaffleParams map. */
  RaffleCreated: {
    raffle_id: number;
    creator: string;
    params: RaffleParams;
  };
  /** topics: [TicketPurchased, raffle_id, buyer]; value: { ticket_ids, total_paid }. */
  TicketPurchased: {
    raffle_id: number;
    buyer: string;
    ticket_ids: number[];
    total_paid: string;
  };
  /** topics: [DrawTriggered, raffle_id]; value: { ledger }. */
  DrawTriggered: {
    raffle_id: number;
    ledger: number;
  };
  /** topics: [RandomnessRequested, raffle_id]; value: { request_id }. */
  RandomnessRequested: {
    raffle_id: number;
    request_id: number;
  };
  /** topics: [RandomnessReceived, raffle_id]; value: { seed, proof }. */
  RandomnessReceived: {
    raffle_id: number;
    seed: string;
    proof: string;
  };
  /** topics: [RaffleFinalized, raffle_id, winner]; value: { winning_ticket_id, prize_amount }. */
  RaffleFinalized: {
    raffle_id: number;
    winner: string;
    winning_ticket_id: number;
    prize_amount: string;
  };
  /** topics: [RaffleCancelled, raffle_id]; value: { reason }. */
  RaffleCancelled: {
    raffle_id: number;
    reason: string;
  };
  /** topics: [TicketRefunded, raffle_id, ticket_id]; value: { recipient, amount }. */
  TicketRefunded: {
    raffle_id: number;
    ticket_id: number;
    recipient: string;
    amount: string;
  };
  /** topics: [ContractPaused, admin]. */
  ContractPaused: {
    admin: string;
  };
  /** topics: [ContractUnpaused, admin]. */
  ContractUnpaused: {
    admin: string;
  };
  /** topics: [AdminTransferProposed, current_admin, proposed_admin]. */
  AdminTransferProposed: {
    current_admin: string;
    proposed_admin: string;
  };
  /** topics: [AdminTransferAccepted, old_admin, new_admin]. */
  AdminTransferAccepted: {
    old_admin: string;
    new_admin: string;
  };
}

/** A single variant of the union: topic discriminant + schema version + payload. */
export type ContractEventVariant<Topic extends ContractEventTopic> = {
  type: Topic;
  schemaVersion: number;
} & ContractEventPayloadMap[Topic];

/**
 * Discriminated union of all supported domain events, keyed by contract event
 * topic. Used by the parser (which returns it), the dispatcher (which narrows
 * it exhaustively) and every handler in between.
 */
export type DomainEvent = {
  [Topic in ContractEventTopic]: ContractEventVariant<Topic>;
}[ContractEventTopic];

/** Extracts a single event variant from {@link DomainEvent} by its topic. */
export type EventOfType<Topic extends ContractEventTopic> = Extract<
  DomainEvent,
  { type: Topic }
>;

/**
 * The decoded payload of an event variant, without the `type` and
 * `schemaVersion` tags — what concrete `BaseEventHandler<E>` subclasses
 * return from their `decode()` so the base class can stamp the tags once.
 */
export type EventPayload<Event extends DomainEvent> = Omit<
  Event,
  "type" | "schemaVersion"
>;

// ── Per-event aliases (keep existing imports working) ───────────────────────

export type RaffleCreatedEvent = EventOfType<"RaffleCreated">;
export type TicketPurchasedEvent = EventOfType<"TicketPurchased">;
export type DrawTriggeredEvent = EventOfType<"DrawTriggered">;
export type RandomnessRequestedEvent = EventOfType<"RandomnessRequested">;
export type RandomnessReceivedEvent = EventOfType<"RandomnessReceived">;
export type RaffleFinalizedEvent = EventOfType<"RaffleFinalized">;
export type RaffleCancelledEvent = EventOfType<"RaffleCancelled">;
export type TicketRefundedEvent = EventOfType<"TicketRefunded">;
export type ContractPausedEvent = EventOfType<"ContractPaused">;
export type ContractUnpausedEvent = EventOfType<"ContractUnpaused">;
export type AdminTransferProposedEvent = EventOfType<"AdminTransferProposed">;
export type AdminTransferAcceptedEvent = EventOfType<"AdminTransferAccepted">;

/**
 * Exhaustiveness guard for switches over {@link DomainEvent}.
 *
 * In the `default` branch of an exhaustive switch, assign the narrowed value
 * to `never` via this helper: adding a new topic to the union then becomes a
 * compile error in every such switch until the new event is handled. The
 * runtime throw only triggers for values that bypassed the compiler (e.g.
 * events re-hydrated from untyped JSON in the DLQ).
 */
export function assertNever(value: never, context = "DomainEvent"): never {
  throw new Error(
    `${context}: unhandled contract event type ${
      (value as { type?: string }).type ?? String(value)
    }`,
  );
}
