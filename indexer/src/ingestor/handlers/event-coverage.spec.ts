import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  EventHandlerRegistry,
} from "../event-handler-registry.service";
import { EventParserService } from "../event-parser.service";
import { RawSorobanEvent } from "../event-parser.interface";
import { IEventHandler } from "../event-handler.interface";
import {
  CONTRACT_EVENT_TOPICS,
  ContractEventTopic,
  DomainEvent,
  RaffleCancelledEvent,
  RaffleCreatedEvent,
  assertNever,
} from "../event.types";
import { RaffleCreatedHandler } from "./raffle-created.handler";
import { TicketPurchasedHandler } from "./ticket-purchased.handler";
import { RaffleFinalizedHandler } from "./raffle-finalized.handler";
import {
  DrawTriggeredHandler,
  RandomnessRequestedHandler,
  RandomnessReceivedHandler,
  RaffleCancelledHandler,
  TicketRefundedHandler,
  ContractPausedHandler,
  ContractUnpausedHandler,
  AdminTransferProposedHandler,
  AdminTransferAcceptedHandler,
} from "./all-handlers";

/**
 * Structural guarantees of the typed event union:
 *
 * 1. every topic in `CONTRACT_EVENT_TOPICS` has a registered default handler;
 * 2. every handler returns its exact typed variant (single compile-time
 *    narrowing in `BaseEventHandler.parse`);
 * 3. the union carries the schema version — including for *legacy* events
 *    that carry no explicit version, which must still parse as v1.
 *
 * The `handlersByTopic` record below is also a compile-time coverage check:
 * adding a topic to the union without adding it here (and in
 * `event-handlers.module.ts`) fails type-checking.
 */
describe("Contract event union coverage", () => {
  const handlersByTopic: Record<ContractEventTopic, IEventHandler> = {
    RaffleCreated: new RaffleCreatedHandler(),
    TicketPurchased: new TicketPurchasedHandler(),
    DrawTriggered: new DrawTriggeredHandler(),
    RandomnessRequested: new RandomnessRequestedHandler(),
    RandomnessReceived: new RandomnessReceivedHandler(),
    RaffleFinalized: new RaffleFinalizedHandler(),
    RaffleCancelled: new RaffleCancelledHandler(),
    TicketRefunded: new TicketRefundedHandler(),
    ContractPaused: new ContractPausedHandler(),
    ContractUnpaused: new ContractUnpausedHandler(),
    AdminTransferProposed: new AdminTransferProposedHandler(),
    AdminTransferAccepted: new AdminTransferAcceptedHandler(),
  };

  let registry: EventHandlerRegistry;
  let parser: EventParserService;

  beforeAll(() => {
    registry = new EventHandlerRegistry();
    for (const handler of Object.values(handlersByTopic)) {
      registry.registerDefaultHandler(handler);
    }
    parser = new EventParserService(registry);
  });

  it("covers every contract event topic with a default handler", () => {
    expect(Object.keys(handlersByTopic).sort()).toEqual(
      [...CONTRACT_EVENT_TOPICS].sort(),
    );

    for (const topic of CONTRACT_EVENT_TOPICS) {
      expect(registry.getHandler("some-contract", topic, 1)).not.toBeNull();
    }
  });

  it("handlers declare the topic they are registered for", () => {
    for (const [topic, handler] of Object.entries(handlersByTopic)) {
      expect(handler.eventName).toBe(topic);
    }
  });

  // ── The union carries the schema version ─────────────────────────────────

  /** Builds a well-formed raw event per topic, without any explicit schema version. */
  const legacyRawEvent = (topic: ContractEventTopic): RawSorobanEvent => {
    const address = Keypair.random().publicKey();
    const sym = (name: string) =>
      nativeToScVal(name, { type: "symbol" }).toXDR("base64");
    const u32 = (n: number) => nativeToScVal(n, { type: "u32" }).toXDR("base64");
    const str = (s: string) =>
      nativeToScVal(s, { type: "string" }).toXDR("base64");

    switch (topic) {
      case "RaffleCreated":
        return {
          type: "contract",
          topics: [sym(topic), u32(1), nativeToScVal(address, { type: "address" }).toXDR("base64")],
          value: nativeToScVal({ ticket_price: 10, max_tickets: 5 }).toXDR("base64"),
        };
      case "TicketPurchased":
        return {
          type: "contract",
          topics: [sym(topic), u32(1), nativeToScVal(address, { type: "address" }).toXDR("base64")],
          value: nativeToScVal({ ticket_ids: [1], total_paid: 100 }).toXDR("base64"),
        };
      case "DrawTriggered":
        return {
          type: "contract",
          topics: [sym(topic), u32(1)],
          value: nativeToScVal({ ledger: 42 }).toXDR("base64"),
        };
      case "RandomnessRequested":
        return {
          type: "contract",
          topics: [sym(topic), u32(1)],
          value: nativeToScVal({ request_id: 7 }).toXDR("base64"),
        };
      case "RandomnessReceived":
        return {
          type: "contract",
          topics: [sym(topic), u32(1)],
          value: nativeToScVal({
            seed: Buffer.from("deadbeef", "hex"),
            proof: Buffer.from("cafe1234", "hex"),
          }).toXDR("base64"),
        };
      case "RaffleFinalized":
        return {
          type: "contract",
          topics: [sym(topic), u32(1), nativeToScVal(address, { type: "address" }).toXDR("base64")],
          value: nativeToScVal({ winning_ticket_id: 3, prize_amount: 900 }).toXDR("base64"),
        };
      case "RaffleCancelled":
        return {
          type: "contract",
          topics: [sym(topic), u32(1)],
          value: nativeToScVal({ reason: "no participants" }).toXDR("base64"),
        };
      case "TicketRefunded":
        return {
          type: "contract",
          topics: [sym(topic), u32(1), u32(2)],
          value: nativeToScVal({ recipient: address, amount: 50 }).toXDR("base64"),
        };
      case "ContractPaused":
        return {
          type: "contract",
          topics: [sym(topic), str(address)],
          value: nativeToScVal(true).toXDR("base64"),
        };
      case "ContractUnpaused":
        return {
          type: "contract",
          topics: [sym(topic), str(address)],
          value: nativeToScVal(true).toXDR("base64"),
        };
      case "AdminTransferProposed":
        return {
          type: "contract",
          topics: [sym(topic), str(address), str(address)],
          value: nativeToScVal(true).toXDR("base64"),
        };
      case "AdminTransferAccepted":
        return {
          type: "contract",
          topics: [sym(topic), str(address), str(address)],
          value: nativeToScVal(true).toXDR("base64"),
        };
      default: {
        // Compile-time exhaustiveness for the fixture builder itself.
        const exhaustive: never = topic;
        throw new Error(`Missing fixture for ${String(exhaustive)}`);
      }
    }
  };

  it.each([...CONTRACT_EVENT_TOPICS])(
    "legacy (versionless) %s event still parses and carries schemaVersion 1",
    (topic) => {
      const parsed = parser.parse(legacyRawEvent(topic));
      expect(parsed).not.toBeNull();
      expect((parsed as DomainEvent).type).toBe(topic);
      expect((parsed as DomainEvent).schemaVersion).toBe(1);
    },
  );

  it.each([...CONTRACT_EVENT_TOPICS])(
    "%s event with an explicit schema_version keeps that version",
    (topic) => {
      const raw = {
        ...legacyRawEvent(topic),
        schema_version: 2,
      } as RawSorobanEvent;
      const parsed = parser.parse(raw);
      expect(parsed).not.toBeNull();
      expect((parsed as DomainEvent).schemaVersion).toBe(2);
    },
  );

  // ── Handlers receive their exact payload type ────────────────────────────

  it("BaseEventHandler.parse returns the handler's exact typed variant", () => {
    const createdHandler = new RaffleCreatedHandler();
    const cancelledHandler = new RaffleCancelledHandler();

    // Compile-time: these assignments only type-check because parse() is
    // generic in the event variant — handlers receive their exact payload type.
    const created: RaffleCreatedEvent | null = createdHandler.parse(
      decodeTopics(legacyRawEvent("RaffleCreated")),
      decodeValue(legacyRawEvent("RaffleCreated")),
      legacyRawEvent("RaffleCreated"),
    );
    const cancelled: RaffleCancelledEvent | null = cancelledHandler.parse(
      decodeTopics(legacyRawEvent("RaffleCancelled")),
      decodeValue(legacyRawEvent("RaffleCancelled")),
      legacyRawEvent("RaffleCancelled"),
    );

    expect(created?.type).toBe("RaffleCreated");
    expect(created?.params.max_tickets).toBe(5);
    expect(cancelled?.reason).toBe("no participants");
  });

  it("assertNever throws for values that bypassed the compiler", () => {
    const foreign = { type: "NotARealEvent" } as unknown as never;
    expect(() => assertNever(foreign)).toThrow(/NotARealEvent/);
  });
});

function decodeTopics(raw: RawSorobanEvent): xdr.ScVal[] {
  return raw.topics.map((t) => xdr.ScVal.fromXDR(t, "base64"));
}

function decodeValue(raw: RawSorobanEvent): xdr.ScVal {
  return xdr.ScVal.fromXDR(raw.value, "base64");
}
