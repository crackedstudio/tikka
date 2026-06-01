import {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  isSupportedSchemaVersion,
  resolveSchemaVersion,
  assertSupportedSchemaVersion,
  UnsupportedSchemaVersionError,
} from "./schema-version";
import { RawSorobanEvent } from "../event-parser.interface";

describe("schema-version", () => {
  describe("constants", () => {
    it("current version is supported", () => {
      expect(isSupportedSchemaVersion(CURRENT_SCHEMA_VERSION)).toBe(true);
      expect(SUPPORTED_SCHEMA_VERSIONS.has(CURRENT_SCHEMA_VERSION)).toBe(true);
    });
  });

  describe("isSupportedSchemaVersion", () => {
    it("accepts v1", () => {
      expect(isSupportedSchemaVersion(1)).toBe(true);
    });

    it("rejects unknown versions", () => {
      expect(isSupportedSchemaVersion(2)).toBe(false);
      expect(isSupportedSchemaVersion(99)).toBe(false);
      expect(isSupportedSchemaVersion(0)).toBe(false);
      expect(isSupportedSchemaVersion(-1)).toBe(false);
    });

    it("rejects non-integers", () => {
      expect(isSupportedSchemaVersion(1.5)).toBe(false);
      expect(isSupportedSchemaVersion(NaN)).toBe(false);
    });
  });

  describe("resolveSchemaVersion", () => {
    const baseRaw: RawSorobanEvent = {
      type: "contract",
      topics: [],
      value: "",
    };

    it("defaults to the current version when no hint is present", () => {
      expect(resolveSchemaVersion(baseRaw)).toBe(CURRENT_SCHEMA_VERSION);
    });

    it("reads an explicit schemaVersion field", () => {
      expect(resolveSchemaVersion({ ...baseRaw, schemaVersion: 2 } as never)).toBe(
        2,
      );
    });

    it("reads an explicit schema_version field", () => {
      expect(
        resolveSchemaVersion({ ...baseRaw, schema_version: 3 } as never),
      ).toBe(3);
    });

    it("falls back to the default for an invalid hint", () => {
      expect(
        resolveSchemaVersion({ ...baseRaw, schemaVersion: "bad" } as never),
      ).toBe(CURRENT_SCHEMA_VERSION);
      expect(
        resolveSchemaVersion({ ...baseRaw, schemaVersion: 0 } as never),
      ).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe("assertSupportedSchemaVersion", () => {
    it("returns the version when supported (v1)", () => {
      expect(assertSupportedSchemaVersion(1)).toBe(1);
    });

    it("throws UnsupportedSchemaVersionError for unknown versions", () => {
      expect(() => assertSupportedSchemaVersion(99, "RaffleCreated")).toThrow(
        UnsupportedSchemaVersionError,
      );
    });

    it("carries the offending version and event type on the error", () => {
      let err: UnsupportedSchemaVersionError | undefined;
      try {
        assertSupportedSchemaVersion(7, "TicketPurchased");
      } catch (e) {
        err = e as UnsupportedSchemaVersionError;
      }
      expect(err).toBeInstanceOf(UnsupportedSchemaVersionError);
      expect(err!.schemaVersion).toBe(7);
      expect(err!.eventType).toBe("TicketPurchased");
      expect(err!.message).toContain("7");
    });
  });
});
