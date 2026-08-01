import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { RaffleCancelledHandler } from "./raffle-cancelled.handler";
import { RaffleCancelledEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

function toScVals(topicsB64: string[], valueB64: string): {
  topics: xdr.ScVal[];
  value: xdr.ScVal;
} {
  return {
    topics: topicsB64.map((t) => xdr.ScVal.fromXDR(t, "base64")),
    value: xdr.ScVal.fromXDR(valueB64, "base64"),
  };
}

describe("RaffleCancelledHandler", () => {
  let handler: RaffleCancelledHandler;

  beforeEach(() => {
    handler = new RaffleCancelledHandler();
  });

  it("parses a valid RaffleCancelled event", () => {
    const topicsB64 = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(42, { type: "u32" }).toXDR("base64"),
    ];
    const valueB64 = nativeToScVal({ reason: "Insufficient participants" }).toXDR(
      "base64",
    );
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: topicsB64,
      value: valueB64,
    };
    const { topics, value } = toScVals(topicsB64, valueB64);

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
    const topicsB64 = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(null, { type: "void" }).toXDR("base64"),
    ];
    const valueB64 = nativeToScVal({ reason: "test" }).toXDR("base64");
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: topicsB64,
      value: valueB64,
    };
    const { topics, value } = toScVals(topicsB64, valueB64);

    expect(handler.parse(topics, value, raw)).toBeNull();
  });

  it("returns null when value data is missing", () => {
    const topicsB64 = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(99, { type: "u32" }).toXDR("base64"),
    ];
    const valueB64 = nativeToScVal(null, { type: "void" }).toXDR("base64");
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: topicsB64,
      value: valueB64,
    };
    const { topics, value } = toScVals(topicsB64, valueB64);

    expect(handler.parse(topics, value, raw)).toBeNull();
  });

  it("returns null for malformed XDR", () => {
    const topicsB64 = [
      nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64"),
      nativeToScVal(1, { type: "u32" }).toXDR("base64"),
    ];
    const raw: RawSorobanEvent = {
      type: "contract",
      topics: topicsB64,
      value: "not-valid-xdr",
    };
    const topics = topicsB64.map((t) => xdr.ScVal.fromXDR(t, "base64"));
    // Pass a valid ScVal that still fails decoding path via throw in toNative
    // by using a deliberately broken value argument through the catch path:
    // simulate by calling with a non-ScVal coerced via any.
    const result = handler.parse(topics, "not-valid-xdr" as any, raw);

    expect(result).toBeNull();
  });
});
