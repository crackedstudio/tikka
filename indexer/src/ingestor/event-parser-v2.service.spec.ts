import { nativeToScVal, Keypair } from "@stellar/stellar-sdk";
import { ConfigService } from "@nestjs/config";
import { EventParserV2Service } from "./event-parser-v2.service";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { RawSorobanEvent } from "./event-parser.interface";
import {
  RaffleCreatedEvent,
  TicketPurchasedEvent,
  DrawTriggeredEvent,
  RandomnessRequestedEvent,
  RandomnessReceivedEvent,
  RaffleFinalizedEvent,
  RaffleCancelledEvent,
  TicketRefundedEvent,
  ContractPausedEvent,
  ContractUnpausedEvent,
  AdminTransferProposedEvent,
  AdminTransferAcceptedEvent,
} from "./event.types";
import { RaffleCreatedHandler } from "./handlers/raffle-created.handler";
import { TicketPurchasedHandler } from "./handlers/ticket-purchased.handler";
import { RaffleFinalizedHandler } from "./handlers/raffle-finalized.handler";
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
} from "./handlers/all-handlers";

/**
 * End-to-end tests for the single chosen parser (V2) covering every known
 * Tikka contract event. These exercise the real decoding path:
 * EventParserV2Service → EventHandlerRegistry → concrete handlers.
 */
describe("EventParserV2Service", () => {
  let service: EventParserV2Service;

  beforeEach(() => {
    const configService = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as ConfigService;

    const registry = new EventHandlerRegistry(configService);

    // Register the full set of default handlers (the migration target).
    for (const handler of [
      new RaffleCreatedHandler(),
      new TicketPurchasedHandler(),
      new RaffleFinalizedHandler(),
      new DrawTriggeredHandler(),
      new RandomnessRequestedHandler(),
      new RandomnessReceivedHandler(),
      new RaffleCancelledHandler(),
      new TicketRefundedHandler(),
      new ContractPausedHandler(),
      new ContractUnpausedHandler(),
      new AdminTransferProposedHandler(),
      new AdminTransferAcceptedHandler(),
    ]) {
      registry.registerDefaultHandler(handler);
    }

    service = new EventParserV2Service(registry);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ── Non-contract rejection ────────────────────────────────────────────────

  it("returns null for non-contract event types", () => {
    for (const type of ["system", "diagnostic", ""]) {
      const raw: RawSorobanEvent = { type, topics: [], value: "" };
      expect(service.parse(raw)).toBeNull();
    }
  });

  // ── Malformed / edge-case XDR ─────────────────────────────────────────────

  it("returns null for malformed XDR in topics", () => {
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: ["not base64 / xdr"],
      value: "also bad",
    };
    expect(service.parse(raw)).toBeNull();
  });

  it("returns null for a contract event with empty topics", () => {
    const raw: RawSorobanEvent = { type: "contract", topics: [], value: "" };
    expect(service.parse(raw)).toBeNull();
  });

  it("does not throw and returns null when the value XDR is malformed", () => {
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(Keypair.random().publicKey(), { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = { type: "contract", topics, value: "not-valid-xdr" };
    expect(() => service.parse(raw)).not.toThrow();
    expect(service.parse(raw)).toBeNull();
  });

  // ── Unknown event symbols ─────────────────────────────────────────────────

  it("returns null for an unknown event symbol", () => {
    const topics = [
      nativeToScVal("UnknownEvent", { type: "symbol" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };
    expect(service.parse(raw)).toBeNull();
  });

  // ── All known Tikka contract events ───────────────────────────────────────

  it("parses RaffleCreated with all fields", () => {
    const creator = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creator, { type: "address" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ price: 10, max_tickets: 100 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RaffleCreatedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCreated");
    expect(parsed.raffle_id).toBe(1);
    expect(parsed.creator).toBe(creator);
    expect(parsed.params.ticket_price).toBe("10");
    expect(parsed.params.max_tickets).toBe(100);
  });

  it("parses TicketPurchased with all fields", () => {
    const buyer = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketPurchased", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(2, { type: "u32" }).toXDR("base64"),
      nativeToScVal(buyer, { type: "address" }).toXDR("base64"),
    ];
    const value = nativeToScVal({
      ticket_ids: [101, 102],
      total_paid: BigInt(500),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as TicketPurchasedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketPurchased");
    expect(parsed.raffle_id).toBe(2);
    expect(parsed.buyer).toBe(buyer);
    expect(parsed.ticket_ids).toEqual([101, 102]);
    expect(parsed.total_paid).toBe("500");
  });

  it("parses DrawTriggered with all fields", () => {
    const topics = [
      nativeToScVal("DrawTriggered", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(5, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ ledger: 999 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as DrawTriggeredEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("DrawTriggered");
    expect(parsed.raffle_id).toBe(5);
    expect(parsed.ledger).toBe(999);
  });

  it("parses RandomnessRequested with all fields", () => {
    const topics = [
      nativeToScVal("RandomnessRequested", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(6, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ request_id: 42 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RandomnessRequestedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RandomnessRequested");
    expect(parsed.raffle_id).toBe(6);
    expect(parsed.request_id).toBe(42);
  });

  it("parses RandomnessReceived with hex seed/proof", () => {
    const seed = Buffer.from("deadbeefcafe1234", "hex");
    const proof = Buffer.from("abcdef0123456789", "hex");
    const topics = [
      nativeToScVal("RandomnessReceived", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(7, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ seed, proof }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RandomnessReceivedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RandomnessReceived");
    expect(parsed.raffle_id).toBe(7);
    expect(parsed.seed).toBe("deadbeefcafe1234");
    expect(parsed.proof).toBe("abcdef0123456789");
  });

  it("parses RaffleFinalized with all fields", () => {
    const winner = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleFinalized", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(8, { type: "u32" }).toXDR("base64"),
      nativeToScVal(winner, { type: "address" }).toXDR("base64"),
    ];
    const value = nativeToScVal({
      winning_ticket_id: 77,
      prize_amount: BigInt(1000000),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RaffleFinalizedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleFinalized");
    expect(parsed.raffle_id).toBe(8);
    expect(parsed.winner).toBe(winner);
    expect(parsed.winning_ticket_id).toBe(77);
    expect(parsed.prize_amount).toBe("1000000");
  });

  it("parses RaffleCancelled with all fields", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(9, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ reason: "not enough participants" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RaffleCancelledEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCancelled");
    expect(parsed.raffle_id).toBe(9);
    expect(parsed.reason).toBe("not enough participants");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("parses TicketRefunded with all fields", () => {
    const recipient = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketRefunded", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(3, { type: "u32" }).toXDR("base64"),
      nativeToScVal(42, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({
      recipient,
      amount: BigInt(100),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as TicketRefundedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketRefunded");
    expect(parsed.raffle_id).toBe(3);
    expect(parsed.ticket_id).toBe(42);
    expect(parsed.recipient).toBe(recipient);
    expect(parsed.amount).toBe("100");
  });

  it("parses ContractPaused with all fields", () => {
    const admin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractPaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(admin, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as ContractPausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractPaused");
    expect(parsed.admin).toBe(admin);
  });

  it("parses ContractUnpaused with all fields", () => {
    const admin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractUnpaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(admin, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as ContractUnpausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractUnpaused");
    expect(parsed.admin).toBe(admin);
  });

  it("parses AdminTransferProposed with all fields", () => {
    const currentAdmin = Keypair.random().publicKey();
    const proposedAdmin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("AdminTransferProposed", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(currentAdmin, { type: "address" }).toXDR("base64"),
      nativeToScVal(proposedAdmin, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as AdminTransferProposedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("AdminTransferProposed");
    expect(parsed.current_admin).toBe(currentAdmin);
    expect(parsed.proposed_admin).toBe(proposedAdmin);
  });

  it("parses AdminTransferAccepted with all fields", () => {
    const oldAdmin = Keypair.random().publicKey();
    const newAdmin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("AdminTransferAccepted", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(oldAdmin, { type: "address" }).toXDR("base64"),
      nativeToScVal(newAdmin, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as AdminTransferAcceptedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("AdminTransferAccepted");
    expect(parsed.old_admin).toBe(oldAdmin);
    expect(parsed.new_admin).toBe(newAdmin);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("handles max u32 max_tickets without overflow", () => {
    const creator = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creator, { type: "address" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ price: 1, max_tickets: 4294967295 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as RaffleCreatedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.params.max_tickets).toBe(4294967295);
  });

  it("handles a large BigInt total_paid as a decimal string", () => {
    const buyer = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketPurchased", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(buyer, { type: "address" }).toXDR("base64"),
    ];
    const value = nativeToScVal({
      ticket_ids: [1],
      total_paid: BigInt("999999999999999999"),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const parsed = service.parse(raw) as TicketPurchasedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.total_paid).toBe("999999999999999999");
  });

  it("tags parsed events with a schemaVersion", () => {
    const admin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractPaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(admin, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as ContractPausedEvent;
    expect(parsed.schemaVersion).toBe(1);
  });
});
