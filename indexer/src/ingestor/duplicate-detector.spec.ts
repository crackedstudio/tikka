import { DuplicateDetector } from "./duplicate-detector";
import { DomainEvent } from "./event.types";

describe("DuplicateDetector", () => {
  const detector = new DuplicateDetector();

  it("derives a stable event identity from raw Horizon fields", () => {
    const event: DomainEvent = {
      type: "TicketPurchased",
      schemaVersion: 2,
      raffle_id: 7,
      buyer: "GBUYER",
      ticket_ids: [1, 2],
      total_paid: "200",
    };

    expect(
      detector.inspect(event, { ledger: "123", paging_token: "page-1" }),
    ).toEqual({
      ledger: 123,
      txHash: "page-1",
      eventId: "page-1",
      handlerName: "TicketProcessor.handleTicketPurchased",
      schemaVersion: 2,
      needsDatabase: true,
    });
  });

  it("prefers the raw transaction id when both id and paging token exist", () => {
    const event: DomainEvent = {
      type: "RaffleCancelled",
      schemaVersion: 1,
      raffle_id: 1,
      reason: "expired",
    };

    expect(
      detector.inspect(event, { ledger: 50, id: "tx-1", paging_token: "page-1" })
        .eventId,
    ).toBe("tx-1");
  });

  it.each([
    { type: "DrawTriggered", schemaVersion: 1, raffle_id: 1, ledger: 10 },
    { type: "RandomnessRequested", schemaVersion: 1, raffle_id: 1, request_id: 9 },
    {
      type: "RandomnessReceived",
      schemaVersion: 1,
      raffle_id: 1,
      seed: "aa",
      proof: "bb",
    },
  ] satisfies DomainEvent[])(
    "marks %s as not requiring durable database mutation",
    (event) => {
      expect(detector.inspect(event, { ledger: 1 }).needsDatabase).toBe(false);
    },
  );
});