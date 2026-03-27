import { Test, TestingModule } from "@nestjs/testing";
import { xdr, nativeToScVal, Keypair } from "@stellar/stellar-sdk";
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

  it("should return null for non-contract event types", () => {
    const raw: RawSorobanEvent = {
      type: "system",
      topics: [],
      value: "",
    };
    expect(service.parse(raw)).toBeNull();
  });

  it("should parse RaffleCreated event", () => {
    const creatorAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
      nativeToScVal(creatorAddress, { type: "address" }).toXDR("base64"),
    ];

    const valueStr = nativeToScVal({ price: 10, max_tickets: 100 }).toXDR(
      "base64",
    );

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as RaffleCreatedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("RaffleCreated");
    expect(parsed.raffle_id).toBe(1);
    expect(parsed.creator).toBe(creatorAddress);
    expect(parsed.params).toBeDefined();
    expect(parsed.params.price).toBe(10);
  });

  it("should parse TicketPurchased event", () => {
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

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as TicketPurchasedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketPurchased");
    expect(parsed.raffle_id).toBe(2);
    expect(parsed.buyer).toBe(buyerAddress);
    expect(parsed.ticket_ids).toEqual([101, 102]);
    expect(parsed.total_paid).toBe("500"); // BigInt is stringified by parser
  });

  it("should return null for malformed XDR", () => {
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: ["not base64 / xdr"],
      value: "also bad",
    };
    expect(service.parse(raw)).toBeNull();
  });

  it("should parse TicketRefunded event", () => {
    const recipientAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("TicketRefunded", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(3, { type: "u32" }).toXDR("base64"),
      nativeToScVal(42, { type: "u32" }).toXDR("base64"), // ticket_id
    ];

    const valueStr = nativeToScVal({
      recipient: recipientAddress,
      amount: BigInt(100),
    }).toXDR("base64");

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as TicketRefundedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("TicketRefunded");
    expect(parsed.raffle_id).toBe(3);
    expect(parsed.ticket_id).toBe(42);
    expect(parsed.recipient).toBe(recipientAddress);
    expect(parsed.amount).toBe("100");
  });

  it("should parse ContractPaused event", () => {
    const adminAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractPaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(adminAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal(0, { type: "u32" }).toXDR("base64");

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as ContractPausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractPaused");
    expect(parsed.admin).toBe(adminAddress);
  });

  it("should parse ContractUnpaused event", () => {
    const adminAddress = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("ContractUnpaused", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(adminAddress, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal(0, { type: "u32" }).toXDR("base64");

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as ContractUnpausedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("ContractUnpaused");
    expect(parsed.admin).toBe(adminAddress);
  });

  it("should parse AdminTransferProposed event", () => {
    const currentAdmin = Keypair.random().publicKey();
    const proposedAdmin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("AdminTransferProposed", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(currentAdmin, { type: "address" }).toXDR("base64"),
      nativeToScVal(proposedAdmin, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal(0, { type: "u32" }).toXDR("base64");

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as AdminTransferProposedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("AdminTransferProposed");
    expect(parsed.current_admin).toBe(currentAdmin);
    expect(parsed.proposed_admin).toBe(proposedAdmin);
  });

  it("should parse AdminTransferAccepted event", () => {
    const oldAdmin = Keypair.random().publicKey();
    const newAdmin = Keypair.random().publicKey();
    const topics = [
      nativeToScVal("AdminTransferAccepted", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(oldAdmin, { type: "address" }).toXDR("base64"),
      nativeToScVal(newAdmin, { type: "address" }).toXDR("base64"),
    ];
    const valueStr = nativeToScVal(0, { type: "u32" }).toXDR("base64");

    const raw: RawSorobanEvent = {
      type: "contract",
      topics,
      value: valueStr,
    };

    const parsed = service.parse(raw) as AdminTransferAcceptedEvent;
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe("AdminTransferAccepted");
    expect(parsed.old_admin).toBe(oldAdmin);
    expect(parsed.new_admin).toBe(newAdmin);
  });
});
