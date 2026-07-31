import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { withSpan, INDEXER_TRACER_NAME } from "./tracing";

describe("withSpan", () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ "service.name": "tikka-indexer-test" }),
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    trace.disable();
  });

  it("nests handler, db, and webhook spans under one process trace", async () => {
    await withSpan(
      "indexer.event.process",
      { "event.type": "RaffleCreated", "event.id": "tx-1" },
      async () => {
        await withSpan(
          "indexer.event.handler",
          { "event.type": "RaffleCreated" },
          async () => {
            await withSpan(
              "indexer.event.db",
              { "db.operation": "apply" },
              async () => {
                // simulate DB work
              },
            );
            await withSpan(
              "indexer.event.webhook",
              { "event.type": "RaffleCreated" },
              async () => {
                // simulate webhook fan-out
              },
            );
          },
        );
      },
    );

    const spans = exporter.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(
      [
        "indexer.event.db",
        "indexer.event.handler",
        "indexer.event.process",
        "indexer.event.webhook",
      ].sort(),
    );

    const processSpan = spans.find((s) => s.name === "indexer.event.process")!;
    const handlerSpan = spans.find((s) => s.name === "indexer.event.handler")!;
    const dbSpan = spans.find((s) => s.name === "indexer.event.db")!;
    const webhookSpan = spans.find((s) => s.name === "indexer.event.webhook")!;

    const traceId = processSpan.spanContext().traceId;
    expect(handlerSpan.spanContext().traceId).toBe(traceId);
    expect(dbSpan.spanContext().traceId).toBe(traceId);
    expect(webhookSpan.spanContext().traceId).toBe(traceId);

    expect(handlerSpan.parentSpanContext?.spanId).toBe(
      processSpan.spanContext().spanId,
    );
    expect(dbSpan.parentSpanContext?.spanId).toBe(
      handlerSpan.spanContext().spanId,
    );
    expect(webhookSpan.parentSpanContext?.spanId).toBe(
      handlerSpan.spanContext().spanId,
    );

    expect(processSpan.attributes["event.type"]).toBe("RaffleCreated");
    expect(processSpan.attributes["event.id"]).toBe("tx-1");
  });

  it("records exceptions on the span", async () => {
    await expect(
      withSpan("indexer.event.process", { "event.id": "bad" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].events.some((e) => e.name === "exception")).toBe(true);
  });

  it("uses the tikka-indexer tracer name", () => {
    const tracer = trace.getTracer(INDEXER_TRACER_NAME);
    expect(tracer).toBeDefined();
    expect(context.active()).toBeDefined();
  });
});
