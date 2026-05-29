import { Test, TestingModule } from "@nestjs/testing";
import { xdr, nativeToScVal, scValToNative, Keypair } from "@stellar/stellar-sdk";
import { EventParserService, RawSorobanEvent } from "./event-parser.service";
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

describe("EventParserService", () => {
  let service: EventParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventParserService],
    }).compile();

    service = module.get<EventParserService>(EventParserService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ── Non-contract rejection ────────────────────────────────────────────────

  it("should return null for non-contract event type: system", () => {
    const raw: RawSorobanEvent = { type: "system", topics: [], value: "" };
    expect(service.parse(raw)).toBeNull();
  });

  it("should return null for non-contract event type: diagnostic", () => {
    const raw: RawSorobanEvent = { type: "diagnostic", topics: [], value: "" };
    expect(service.parse(raw)).toBeNull();
  });

  it("should return null for empty event type string", () => {
    const raw: RawSorobanEvent = { type: "", topics: [], value: "" };
    expect(service.parse(raw)).toBeNull();
  });

  // ── Malformed / edge-case XDR ─────────────────────────────────────────────

  it("should return null for malformed XDR in topics", () => {
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: ["not base64 / xdr"],
      value: "also bad",
    };
    expect(service.parse(raw)).toBeNull();
  });

  it("should return null for contract event with empty topics", () => {
    const raw: RawSorobanEvent = { type: "contract", topics: [], value: "" };
    expect(service.parse(raw)).toBeNull();
  });

  it("should return null when event name topic is valid but value XDR is malformed", () => {
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

  it("should return null for unknown event symbol", () => {
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

  it("should return null for empty symbol in topics[0]", () => {
    const topics = [
      nativeToScVal("", { type: "symbol" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };
    expect(service.parse(raw)).toBeNull();
  });

  // ── All 12 event types ────────────────────────────────────────────────────

  it("should parse RaffleCreated event with all fields", () => {
    const creatorAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creatorAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ price: 10, max_tickets: 100 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RaffleCreatedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCreated");
    expect(parsed.raffle_id).toBe(1);
    expect(parsed.creator).toBe(creatorAddress);
    expect(parsed.params.ticket_price).toBe("10");
    expect(parsed.params.max_tickets).toBe(100);
  });

  it("should use parseV2 when contract is mapped to v2 (fallback to v1 behavior)", () => {
    const creatorAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creatorAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ price: 10, max_tickets: 100 }).toXDR("base64");
    const raw: any = { type: "contract", topics, value: valueStr, contractId: "V2_TEST_CONTRACT" };

    const spy = jest.spyOn(service as any, "parseV2");
    const parsed = service.parse(raw as any) as RaffleCreatedEvent;
    expect(spy).toHaveBeenCalled();
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCreated");
    expect(parsed.raffle_id).toBe(1);
    expect(parsed.creator).toBe(creatorAddress);
    expect(parsed.params.ticket_price).toBe("10");
    expect(parsed.params.max_tickets).toBe(100);
  });

  it("should parse TicketPurchased event with all fields", () => {
    const buyerAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketPurchased", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(2, { type: "u32" }).toXDR("base64"),
      nativeToScVal(buyerAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({
      ticket_ids: [101, 102],
      total_paid: BigInt(500),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as TicketPurchasedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketPurchased");
    expect(parsed.raffle_id).toBe(2);
    expect(parsed.buyer).toBe(buyerAddress);
    expect(parsed.ticket_ids).toEqual([101, 102]);
    expect(parsed.total_paid).toBe("500");
  });

  it("should parse DrawTriggered event with all fields", () => {
    const topics = [
      nativeToScVal("DrawTriggered", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(5, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ ledger: 999 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as DrawTriggeredEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("DrawTriggered");
    expect(parsed.raffle_id).toBe(5);
    expect(parsed.ledger).toBe(999);
  });

  it("should parse RandomnessRequested event with all fields", () => {
    const topics = [
      nativeToScVal("RandomnessRequested", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(6, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ request_id: 42 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RandomnessRequestedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RandomnessRequested");
    expect(parsed.raffle_id).toBe(6);
    expect(parsed.request_id).toBe(42);
  });

  it("should parse RandomnessReceived event with all fields (hex seed/proof)", () => {
    const seedBytes = Buffer.from("deadbeefcafe1234", "hex");
    const proofBytes = Buffer.from("abcdef0123456789", "hex");
    const topics = [
      nativeToScVal("RandomnessReceived", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(7, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ seed: seedBytes, proof: proofBytes }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RandomnessReceivedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RandomnessReceived");
    expect(parsed.raffle_id).toBe(7);
    expect(parsed.seed).toBe("deadbeefcafe1234");
    expect(parsed.proof).toBe("abcdef0123456789");
  });

  it("should parse RaffleFinalized event with all fields", () => {
    const winnerAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleFinalized", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(8, { type: "u32" }).toXDR("base64"),
      nativeToScVal(winnerAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({
      winning_ticket_id: 77,
      prize_amount: BigInt(1000000),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RaffleFinalizedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleFinalized");
    expect(parsed.raffle_id).toBe(8);
    expect(parsed.winner).toBe(winnerAddress);
    expect(parsed.winning_ticket_id).toBe(77);
    expect(parsed.prize_amount).toBe("1000000");
  });

  it("should parse RaffleCancelled event with all fields", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(9, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ reason: "not enough participants" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RaffleCancelledEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCancelled");
    expect(parsed.raffle_id).toBe(9);
    expect(parsed.reason).toBe("not enough participants");
  });

  it("should parse TicketRefunded event with all fields", () => {
    const recipientAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketRefunded", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(3, { type: "u32" }).toXDR("base64"),
      nativeToScVal(42, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({
      recipient: recipientAddress,
      amount: BigInt(100),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as TicketRefundedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketRefunded");
    expect(parsed.raffle_id).toBe(3);
    expect(parsed.ticket_id).toBe(42);
    expect(parsed.recipient).toBe(recipientAddress);
    expect(parsed.amount).toBe("100");
  });

  it("should parse ContractPaused event with all fields", () => {
    const adminAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractPaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(adminAddress, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as ContractPausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractPaused");
    expect(parsed.admin).toBe(adminAddress);
  });

  it("should parse ContractUnpaused event with all fields", () => {
    const adminAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractUnpaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(adminAddress, { type: "address" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    };

    const parsed = service.parse(raw) as ContractUnpausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractUnpaused");
    expect(parsed.admin).toBe(adminAddress);
  });

  it("should parse AdminTransferProposed event with all fields", () => {
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

  it("should parse AdminTransferAccepted event with all fields", () => {
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

  it("should handle max u32 max_tickets (4294967295) without overflow", () => {
    const creatorAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creatorAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ price: 1, max_tickets: 4294967295 }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RaffleCreatedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.params.max_tickets).toBe(4294967295);
  });

  it("should handle large BigInt total_paid as correct decimal string", () => {
    const buyerAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketPurchased", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(buyerAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({
      ticket_ids: [1],
      total_paid: BigInt("999999999999999999"),
    }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as TicketPurchasedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.total_paid).toBe("999999999999999999");
  });

  it("should handle empty string reason in RaffleCancelled", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal({ reason: "" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value: valueStr };

    const parsed = service.parse(raw) as RaffleCancelledEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.reason).toBe("");
  });

  // ── XDR round-trip ────────────────────────────────────────────────────────

  it("should round-trip a Stellar address through XDR encode/decode", () => {
    const address = Keypair.random().publicKey();
    const encoded = nativeToScVal(address, { type: "address" }).toXDR("base64");
    const decoded = scValToNative(xdr.ScVal.fromXDR(encoded, "base64"));
    expect(decoded).toBe(address);
  });

  it("should round-trip a u32 integer through XDR encode/decode", () => {
    const value = 12345;
    const encoded = nativeToScVal(value, { type: "u32" }).toXDR("base64");
    const decoded = scValToNative(xdr.ScVal.fromXDR(encoded, "base64"));
    expect(Number(decoded)).toBe(value);
  });

  it("should round-trip a symbol string through XDR encode/decode", () => {
    const sym = "RaffleCreated";
    const encoded = nativeToScVal(sym, { type: "symbol" }).toXDR("base64");
    const decoded = scValToNative(xdr.ScVal.fromXDR(encoded, "base64"));
    expect(decoded).toBe(sym);
  });
});
