import { trace, SpanStatusCode, Span, AttributeValue } from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export const INDEXER_TRACER_NAME = "tikka-indexer";

let provider: NodeTracerProvider | undefined;

/**
 * Initialize the OpenTelemetry tracer provider for the indexer.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Env:
 * - `OTEL_EXPORTER_OTLP_ENDPOINT` — enable OTLP/HTTP export (e.g. http://localhost:4318/v1/traces)
 * - `OTEL_TRACES_CONSOLE=true` — also (or instead) print spans to stdout
 * - `OTEL_SERVICE_NAME` — defaults to `tikka-indexer`
 */
export function initTracing(): NodeTracerProvider {
  if (provider) {
    return provider;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || "tikka-indexer";
  const spanProcessors: SpanProcessor[] = [];

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: otlpEndpoint.includes("/v1/traces")
            ? otlpEndpoint
            : `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
        }),
      ),
    );
  }

  if (process.env.OTEL_TRACES_CONSOLE === "true") {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      "service.name": serviceName,
      "service.namespace": "tikka",
    }),
    spanProcessors,
  });

  // Registers AsyncLocalStorage context manager so nested startActiveSpan
  // calls share one trace across handler → DB → webhook.
  provider.register();
  return provider;
}

export function getIndexerTracer() {
  return trace.getTracer(INDEXER_TRACER_NAME);
}

export type SpanAttributes = Record<string, AttributeValue>;

/**
 * Run `fn` inside an active span. Nested calls become child spans on the same
 * trace so ingest → handler/DB → webhook form one connected journey.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getIndexerTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      return await fn(span);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function shutdownTracing(): Promise<void> {
  if (!provider) return;
  await provider.shutdown();
  provider = undefined;
}
