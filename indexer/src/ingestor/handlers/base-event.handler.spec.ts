import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { EventPayload, RaffleCancelledEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

/**
 * Concrete probe handler used to exercise the {@link BaseEventHandler}
 * template method directly (every real handler is a thin `decode` override on
 * top of the same base class).
 *
 * `decode` is scripted so a single test can drive the three outcomes that
 * matter to the dispatcher: a payload, "missing data" (`null`), and a thrown
 * error.
 */
class ProbeHandler extends BaseEventHandler<RaffleCancelledEvent> {
  public decodeError: Error | null = null;
  public decodeResult: EventPayload<RaffleCancelledEvent> | null = {
    raffle_id: 1,
    reason: "probe",
  };

  constructor() {
    super("RaffleCancelled");
  }

  protected decode(): EventPayload<RaffleCancelledEvent> | null {
    if (this.decodeError) throw this.decodeError;
    return this.decodeResult;
  }

  // Expose the protected narrowing helpers so their safe behaviour can be
  // asserted directly, without a second copy of the decode logic in the test.
  public probeToNative(scVal: xdr.ScVal): unknown {
    return this.toNative(scVal);
  }
  public probeToNumber(scVal: xdr.ScVal): number | null {
    return this.toNumber(scVal);
  }
  public probeToString(scVal: xdr.ScVal): string | null {
    return this.toString(scVal);
  }
  public probeToRecord(scVal: xdr.ScVal): Record<string, unknown> | null {
    return this.toRecord(scVal);
  }
  public probeToNumberArray(scVal: xdr.ScVal): number[] | null {
    return this.toNumberArray(scVal);
  }
  public probeToHexString(value: unknown): string {
    return this.toHexString(value);
  }
}

/** Minimal raw event; `schema_version` is spread in by the tests that need it. */
const rawEvent = (): RawSorobanEvent => ({
  type: "contract",
  topics: [nativeToScVal("RaffleCancelled", { type: "symbol" }).toXDR("base64")],
  value: nativeToScVal({ reason: "probe" }).toXDR("base64"),
});

const u32 = (n: number): xdr.ScVal => nativeToScVal(n, { type: "u32" });
const symbol = (s: string): xdr.ScVal => nativeToScVal(s, { type: "symbol" });
const stringVal = (s: string): xdr.ScVal => nativeToScVal(s, { type: "string" });

describe("BaseEventHandler", () => {
  let handler: ProbeHandler;

  beforeEach(() => {
    handler = new ProbeHandler();
  });

  // ── Stamping the discriminant and schema version ─────────────────────────

  it("stamps the handler's registered topic and the resolved schema version", () => {
    const parsed = handler.parse([], u32(1), rawEvent());

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("RaffleCancelled");
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.raffle_id).toBe(1);
    expect(parsed?.reason).toBe("probe");
  });

  it("preserves an explicit schema_version from the raw event", () => {
    const raw = { ...rawEvent(), schema_version: 2 } as RawSorobanEvent;
    const parsed = handler.parse([], u32(1), raw);

    expect(parsed?.schemaVersion).toBe(2);
  });

  it("carries an unsupported schema version through instead of dropping the event", () => {
    // The handler must not reject the version: the dispatcher dead-letters it
    // with `SCHEMA_UNSUPPORTED` using the version it can still read here.
    const raw = { ...rawEvent(), schema_version: 99 } as RawSorobanEvent;
    const parsed = handler.parse([], u32(1), raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(99);
  });

  // ── Failure handling: never throw, always signal via `null` ──────────────

  it("returns null (without throwing) when decode reports missing data", () => {
    handler.decodeResult = null;

    let parsed: RaffleCancelledEvent | null = null;
    expect(() => {
      parsed = handler.parse([], u32(1), rawEvent());
    }).not.toThrow();
    expect(parsed).toBeNull();
  });

  it("swallows decode errors and returns null so the event can be dead-lettered", () => {
    handler.decodeError = new Error("decoded field is not a map");

    let parsed: RaffleCancelledEvent | null = null;
    expect(() => {
      parsed = handler.parse([], u32(1), rawEvent());
    }).not.toThrow();
    expect(parsed).toBeNull();
  });

  // ── Safe narrowing helpers ───────────────────────────────────────────────

  describe("narrowing helpers", () => {
    it("toNative returns the decoded native value", () => {
      expect(handler.probeToNative(u32(7))).toBe(7);
    });

    it("toNumber narrows numerics and returns null for non-numerics", () => {
      expect(handler.probeToNumber(u32(7))).toBe(7);
      expect(handler.probeToNumber(symbol("nope"))).toBeNull();
    });

    it("toString narrows strings and returns null for maps", () => {
      expect(handler.probeToString(stringVal("hello"))).toBe("hello");
      expect(handler.probeToString(nativeToScVal({ a: 1 }))).toBeNull();
    });

    it("toRecord narrows maps and rejects arrays/primitives", () => {
      expect(handler.probeToRecord(nativeToScVal({ a: 1 }))).toEqual({ a: 1 });
      expect(handler.probeToRecord(nativeToScVal([1, 2]))).toBeNull();
      expect(handler.probeToRecord(u32(1))).toBeNull();
    });

    it("toNumberArray narrows numeric vectors and rejects non-numeric ones", () => {
      expect(handler.probeToNumberArray(nativeToScVal([1, 2]))).toEqual([1, 2]);
      expect(
        handler.probeToNumberArray(nativeToScVal(["a", "b"])),
      ).toBeNull();
      expect(handler.probeToNumberArray(u32(1))).toBeNull();
    });

    it("toHexString renders buffers as hex and stringifies other values", () => {
      expect(handler.probeToHexString(Buffer.from("deadbeef", "hex"))).toBe(
        "deadbeef",
      );
      expect(handler.probeToHexString(new Uint8Array([0xca, 0xfe]))).toBe(
        "cafe",
      );
      expect(handler.probeToHexString("plain")).toBe("plain");
    });
  });
});
