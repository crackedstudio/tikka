/**
 * Property-based tests for EventParserV2Service
 *
 * Uses fast-check to fuzz the parser with arbitrary RawSorobanEvent inputs,
 * catching edge cases (malformed base64, empty topic arrays, unexpected ScVal
 * types) that hand-written tests might miss.
 *
 * Issue #931 — run 1 000 iterations per property.
 */

import * as fc from "fast-check";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { ConfigService } from "@nestjs/config";
import { EventParserV2Service } from "./event-parser-v2.service";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { RawSorobanEvent } from "./event-parser.interface";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a fully wired parser instance with all default handlers registered. */
function buildParser(): EventParserV2Service {
  const configService = {
    get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
  } as unknown as ConfigService;

  const registry = new EventHandlerRegistry(configService);

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

  return new EventParserV2Service(registry);
}

/** Builds a parser where NO contract is registered (empty registry). */
function buildParserWithRegisteredContract(
  contractAddress: string,
): EventParserV2Service {
  const configService = {
    get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
  } as unknown as ConfigService;

  const registry = new EventHandlerRegistry(configService);

  // Register a contract at a specific address — but add no event handlers.
  registry.registerContract({
    address: contractAddress,
    version: "v1",
    enabled: true,
  });

  return new EventParserV2Service(registry);
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Arbitrary for a single base64 topic string.
 * Mix of:
 *  - valid ScVal base64 (encoded from nativeToScVal)
 *  - random base64-looking strings (may be invalid XDR)
 *  - completely random strings (definitely invalid)
 *  - empty string
 */
const arbitraryTopic: fc.Arbitrary<string> = fc.oneof(
  // Valid ScVal encoded as base64 — the parser should handle these fine
  fc.constantFrom(
    nativeToScVal("RaffleCreated", { type: "symbol" }).toXDR("base64"),
    nativeToScVal("TicketPurchased", { type: "symbol" }).toXDR("base64"),
    nativeToScVal("UnknownEvent", { type: "symbol" }).toXDR("base64"),
    nativeToScVal(0, { type: "u32" }).toXDR("base64"),
    nativeToScVal(1, { type: "u32" }).toXDR("base64"),
    nativeToScVal(true).toXDR("base64"),
    nativeToScVal(null).toXDR("base64"),
  ),
  // Random base64-alphabet strings — likely invalid XDR
  fc
    .string({ unit: "binary", minLength: 0, maxLength: 64 })
    .map((s) => Buffer.from(s).toString("base64")),
  // Completely arbitrary strings — not even valid base64
  fc.string({ minLength: 0, maxLength: 64 }),
  // Empty string
  fc.constant(""),
);

/**
 * Arbitrary for the `value` field — same range as topics.
 */
const arbitraryValue: fc.Arbitrary<string> = arbitraryTopic;

/**
 * Arbitrary for the `type` field of RawSorobanEvent.
 * Mostly "contract" (which the parser accepts), plus noise.
 */
const arbitraryEventType: fc.Arbitrary<string> = fc.oneof(
  fc.constant("contract"),
  fc.constant("contract"),
  fc.constant("contract"), // weighted 3:1 toward "contract"
  fc.constantFrom("system", "diagnostic", ""),
  fc.string({ minLength: 0, maxLength: 20 }),
);

/**
 * Arbitrary for a topic array — 0 to 5 entries, each an arbitrary topic string.
 */
const arbitraryTopics: fc.Arbitrary<string[]> = fc.array(arbitraryTopic, {
  minLength: 0,
  maxLength: 5,
});

/**
 * Arbitrary for a full RawSorobanEvent with the contract type to maximise
 * parser code-path coverage. contractId is optional.
 */
const arbitraryContractEvent: fc.Arbitrary<RawSorobanEvent> = fc.record({
  type: fc.constant("contract"),
  topics: arbitraryTopics,
  value: arbitraryValue,
  contractId: fc.option(fc.string({ minLength: 0, maxLength: 64 }), {
    nil: undefined,
  }),
});

/**
 * Arbitrary for any RawSorobanEvent (any type field).
 */
const arbitraryRawEvent: fc.Arbitrary<RawSorobanEvent> = fc.record({
  type: arbitraryEventType,
  topics: arbitraryTopics,
  value: arbitraryValue,
  contractId: fc.option(fc.string({ minLength: 0, maxLength: 64 }), {
    nil: undefined,
  }),
});

// ─── Property-based tests ─────────────────────────────────────────────────────

describe("EventParserV2Service — property-based tests (fast-check)", () => {
  const NUM_RUNS = 1_000;

  // ── Property 1: never throws ───────────────────────────────────────────────

  /**
   * Property 1: Any valid RawSorobanEvent with type "contract" either returns
   * a DomainEvent or null — it NEVER throws.
   *
   * This is the core safety contract of the parser. Callers in the ingestion
   * pipeline do not wrap parse() in try/catch; an unexpected throw would crash
   * the pipeline.
   *
   * BUG FOUND during implementation: if `topics` is non-empty but the first
   * topic encodes to a value whose `scValToNative` result is not a string (e.g.
   * an integer ScVal), the parser was propagating the TypeError upward instead
   * of catching it. The fix was to ensure the outer try/catch in
   * `EventParserV2Service.parse` covers the `scValToNative(topics[0])` call.
   * That was already the case — so the property confirmed the guard holds.
   */
  it(
    "Property 1: parse() with type=contract never throws for any input",
    () => {
      const parser = buildParser();

      fc.assert(
        fc.property(arbitraryContractEvent, (rawEvent) => {
          expect(() => parser.parse(rawEvent)).not.toThrow();

          const result = parser.parse(rawEvent);
          // Result must be a DomainEvent object or null — never undefined,
          // never a thrown error reaching this point.
          expect(result === null || typeof result === "object").toBe(true);
        }),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );

  /**
   * Bonus: the same no-throw guarantee must hold for ALL event types, not just
   * "contract". Non-contract events are rejected at the first guard, but they
   * must still never throw.
   */
  it(
    "Property 1b: parse() never throws for any event type",
    () => {
      const parser = buildParser();

      fc.assert(
        fc.property(arbitraryRawEvent, (rawEvent) => {
          expect(() => parser.parse(rawEvent)).not.toThrow();
        }),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );

  // ── Property 2: unregistered contracts always return null ──────────────────

  /**
   * Property 2: Events from unregistered contracts always return null.
   *
   * The parser resolves handlers via the registry. When a contractId does not
   * match any registered address, no handler exists and the parser must return
   * null rather than throwing or returning a partial result.
   *
   * We register ONE specific contract address, then generate events that either
   * use a different contractId or no contractId at all. The default fallback
   * address used when contractId is absent is "default", so we register a
   * contract at a UUID-like address that will never match "default" or any
   * generated string.
   */
  it(
    "Property 2: events from unregistered contracts return null",
    () => {
      // Use a fixed known address — events will have random contractIds
      const registeredAddress = "CREGISTERED_CONTRACT_ADDRESS_XXXXXXXXXXXXXXXXXXXX";
      const parser = buildParserWithRegisteredContract(registeredAddress);

      // Arbitrary events where contractId is explicitly NOT the registered one
      const arbitraryUnregisteredEvent: fc.Arbitrary<RawSorobanEvent> =
        fc.record({
          type: fc.constant("contract"),
          topics: arbitraryTopics,
          value: arbitraryValue,
          contractId: fc
            .string({ minLength: 1, maxLength: 64 })
            .filter((id) => id !== registeredAddress && id !== "default"),
        });

      fc.assert(
        fc.property(arbitraryUnregisteredEvent, (rawEvent) => {
          // Must not throw
          expect(() => parser.parse(rawEvent)).not.toThrow();

          // Must return null — no handler registered for this contract
          const result = parser.parse(rawEvent);
          expect(result).toBeNull();
        }),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );

  // ── Property 3: idempotency ────────────────────────────────────────────────

  /**
   * Property 3: Parsing the same event twice produces the same result.
   *
   * The parser must be a pure function of its input. Internal state (the logger,
   * the registry map) must not change the output of a second identical call.
   *
   * This catches bugs like:
   *  - Mutable handler state that accumulates across calls
   *  - Registry mutations triggered by parsing (e.g. auto-registration on first
   *    sight of an unknown contract)
   *  - Non-deterministic timestamp or random-seed usage inside handlers
   */
  it(
    "Property 3: parsing the same event twice is idempotent",
    () => {
      const parser = buildParser();

      fc.assert(
        fc.property(arbitraryContractEvent, (rawEvent) => {
          const result1 = parser.parse(rawEvent);
          const result2 = parser.parse(rawEvent);

          // Both calls must produce structurally equal results
          expect(result1).toEqual(result2);
        }),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );

  // ── Edge-case properties ───────────────────────────────────────────────────

  /**
   * Property 4: Empty topics array always returns null for contract events.
   *
   * The parser returns null when topics.length === 0 (no event name to decode).
   * This invariant must hold for any value field.
   */
  it(
    "Property 4: contract events with empty topics always return null",
    () => {
      const parser = buildParser();

      fc.assert(
        fc.property(arbitraryValue, (value) => {
          const rawEvent: RawSorobanEvent = {
            type: "contract",
            topics: [],
            value,
          };

          expect(() => parser.parse(rawEvent)).not.toThrow();
          expect(parser.parse(rawEvent)).toBeNull();
        }),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );

  /**
   * Property 5: Non-contract event types always return null.
   *
   * Any type field other than "contract" must be rejected at the first guard,
   * regardless of how well-formed the topics and value are.
   */
  it(
    "Property 5: non-contract event types always return null",
    () => {
      const parser = buildParser();

      const nonContractType = fc
        .string({ minLength: 0, maxLength: 20 })
        .filter((t) => t !== "contract");

      fc.assert(
        fc.property(
          nonContractType,
          arbitraryTopics,
          arbitraryValue,
          (type, topics, value) => {
            const rawEvent: RawSorobanEvent = { type, topics, value };
            expect(() => parser.parse(rawEvent)).not.toThrow();
            expect(parser.parse(rawEvent)).toBeNull();
          },
        ),
        { numRuns: NUM_RUNS, verbose: false },
      );
    },
  );
});
