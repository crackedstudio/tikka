import { nativeToScVal } from "@stellar/stellar-sdk";
import { RaffleCancelledHandler } from "./raffle-cancelled.handler";
import { RaffleCancelledEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

describe("RaffleCancelledHandler", () => {
  let handler: RaffleCancelledHandler;

  beforeEach(() => {
    handler = new RaffleCancelledHandler();
  });

  it("parses a valid RaffleCancelled event", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(42, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ reason: "Insufficient participants" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const result = handler.parse(topics, value, raw);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "RaffleCancelled",
      raffle_id: 42,
      reason: "Insufficient participants",
      schemaVersion: 1,
    } satisfies Partial<RaffleCancelledEvent>);
  });

  it("returns null when raffle_id is missing", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(null, { type: "void" }).toXDR("base64"),
    ];
    const value = nativeToScVal({ reason: "test" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const result = handler.parse(topics, value, raw);

    expect(result).toBeNull();
  });

  it("returns null when value data is missing", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(99, { type: "u32" }).toXDR("base64"),
    ];
    const value = nativeToScVal(null, { type: "void" }).toXDR("base64");
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const result = handler.parse(topics, value, raw);

    expect(result).toBeNull();
  });

  it("returns null for malformed XDR", () => {
    const topics = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
    ];
    const value = "not-valid-xdr";
    const raw: RawSorobanEvent = { type: "contract", topics, value };

    const result = handler.parse(topics, value, raw);

    expect(result).toBeNull();
  });
});
