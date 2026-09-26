import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { EventHandlerRegistry } from "../event-handler-registry.service";
import { EventParserService } from "../event-parser.service";
import { RawSorobanEvent } from "../event-parser.interface";
import {
  PipelineState,
  PipelineStateMachine,
  PipelineTransition,
} from "../pipeline-state";
import {
  CONTRACT_EVENT_TOPICS,
  ContractEventTopic,
  EventPayload,
  RaffleCancelledEvent,
} from "../event.types";
import { BaseEventHandler } from "./base-event.handler";
import { ALL_DEFAULT_HANDLERS } from "./all-handlers";

/**
 * Aggregation contract of the default handler set.
 *
 * The per-topic specs cover how each event decodes; this suite covers the
 * *set* the registry is built from:
 *
 * 1. `ALL_DEFAULT_HANDLERS` covers every topic in `CONTRACT_EVENT_TOPICS`
 *    exactly once — no topic is unhandled and no topic is claimed twice;
 * 2. a topic resolves to exactly one handler through the registry;
 * 3. a duplicate claim is rejected at registration, so "which handler wins"
 *    can never depend on module-init order;
 * 4. an event with a topic no handler claims is routed to the dead-letter
 *    path (parse → null → `PARSE_FAILURE` → `DLQ_ENQUEUED`) rather than being
 *    silently dropped;
 * 5. the registered topics stay in sync with the SDK's canonical contract
 *    event bindings, so a new contract event fails this test instead of
 *    disappearing at ingestion time.
 */

/**
 * Reads the SDK's canonical event topics from
 * `sdk/src/contract/bindings.ts`.
 *
 * The indexer does not depend on `@tikka/sdk` (it only shares
 * `@tikka/types`), so the monorepo checkout is the source rather than an
 * import; parsing the source keeps the check dependency-free while still
 * failing when the SDK adds or renames an event.
 */
function sdkContractEventTopics(): string[] {
  const bindingsPath = join(
    __dirname,
    "../../../../sdk/src/contract/bindings.ts",
  );
  const source = readFileSync(bindingsPath, "utf8");

  const block = source.match(
    /export const ContractEvent = \{([\s\S]*?)\} as const;/,
  )?.[1];

  if (!block) {
    throw new Error(
      `Could not find \`export const ContractEvent = {...} as const\` in ${bindingsPath}`,
    );
  }

  return [...block.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
}

/** A second handler for an already-claimed topic, used to prove rejection. */
class ImpostorCancelledHandler extends BaseEventHandler<RaffleCancelledEvent> {
  constructor() {
    super("RaffleCancelled");
  }

  protected decode(): EventPayload<RaffleCancelledEvent> | null {
    return null;
  }
}

const buildRegistry = (): EventHandlerRegistry => {
  const registry = new EventHandlerRegistry();
  for (const HandlerClass of ALL_DEFAULT_HANDLERS) {
    registry.registerDefaultHandler(new HandlerClass());
  }
  return registry;
};

const contractEvent = (topic: string): RawSorobanEvent => ({
  type: "contract",
  topics: [nativeToScVal(topic, { type: "symbol" }).toXDR("base64")],
  value: nativeToScVal(1, { type: "u32" }).toXDR("base64"),
});

describe("default handler set", () => {
  it("covers every contract event topic exactly once", () => {
    const topics = ALL_DEFAULT_HANDLERS.map(
      (HandlerClass) => new HandlerClass().eventName,
    );

    expect([...topics].sort()).toEqual([...CONTRACT_EVENT_TOPICS].sort());
    // No topic is claimed by two handler classes.
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("only registers handlers for topics that are part of the union", () => {
    for (const HandlerClass of ALL_DEFAULT_HANDLERS) {
      const handler = new HandlerClass();
      expect(CONTRACT_EVENT_TOPICS).toContain(
        handler.eventName as ContractEventTopic,
      );
    }
  });

  it("resolves every topic to exactly one handler", () => {
    const registry = buildRegistry();
    const registeredTopics = registry.getDefaultHandlerTopics();

    expect(registeredTopics).toHaveLength(CONTRACT_EVENT_TOPICS.length);
    expect(new Set(registeredTopics).size).toBe(registeredTopics.length);

    for (const topic of CONTRACT_EVENT_TOPICS) {
      expect(registry.getHandler("any-contract", topic, 1)).not.toBeNull();
    }
  });

  it("rejects a second, different handler claiming an already-claimed topic", () => {
    const registry = buildRegistry();
    const incumbent = registry.getHandler("any-contract", "RaffleCancelled", 1);

    expect(incumbent).not.toBeNull();
    expect(() =>
      registry.registerDefaultHandler(new ImpostorCancelledHandler()),
    ).toThrow(/RaffleCancelled/);

    // The original handler still owns the topic.
    expect(registry.getHandler("any-contract", "RaffleCancelled", 1)).toBe(
      incumbent,
    );
    expect(registry.getDefaultHandlerTopics()).toHaveLength(
      CONTRACT_EVENT_TOPICS.length,
    );
  });

  it("treats re-registering the same instance as a no-op", () => {
    const registry = new EventHandlerRegistry();
    const handler = new ALL_DEFAULT_HANDLERS[0]();

    registry.registerDefaultHandler(handler);
    expect(() => registry.registerDefaultHandler(handler)).not.toThrow();
    expect(registry.getDefaultHandlerTopics()).toEqual([handler.eventName]);
  });

  it("returns null for a topic no handler claims", () => {
    const registry = buildRegistry();

    expect(registry.getHandler("any-contract", "NotARealEvent", 1)).toBeNull();
  });

  it("dead-letters an event whose topic is unhandled instead of dropping it", () => {
    const parser = new EventParserService(buildRegistry());

    // The parser returns null for an unclaimed topic...
    expect(parser.parse(contractEvent("NotARealEvent"))).toBeNull();

    // ...and the fallback for a null parse is the DLQ path, not a silent skip
    // (see `LedgerPollerService`: PARSE_FAILURE → DLQ_ENQUEUED).
    const pipeline = new PipelineStateMachine();
    expect(pipeline.apply(PipelineTransition.START)).toBe(true);
    expect(pipeline.apply(PipelineTransition.EVENTS_RECEIVED)).toBe(true);
    expect(pipeline.current).toBe(PipelineState.PARSING);

    expect(pipeline.apply(PipelineTransition.PARSE_FAILURE)).toBe(true);
    expect(pipeline.current).toBe(PipelineState.DEAD_LETTER);

    expect(pipeline.apply(PipelineTransition.DLQ_ENQUEUED)).toBe(true);
    expect(pipeline.snapshot().recent.at(-1)?.transition).toBe(
      PipelineTransition.DLQ_ENQUEUED,
    );
  });

  it("stays in sync with the SDK's canonical contract event bindings", () => {
    const sdkTopics = sdkContractEventTopics();

    // Guard against a silently-broken parser (e.g. the bindings block moved).
    expect(sdkTopics.length).toBe(CONTRACT_EVENT_TOPICS.length);

    expect([...sdkTopics].sort()).toEqual([...CONTRACT_EVENT_TOPICS].sort());
  });
});
