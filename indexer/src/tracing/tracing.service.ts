import { Injectable } from "@nestjs/common";
import { Span } from "@opentelemetry/api";
import { SpanAttributes, withSpan } from "./tracing";

/**
 * Thin Nest wrapper around OpenTelemetry active spans so handlers, DB work,
 * and webhooks share one trace context per ingested event.
 */
@Injectable()
export class TracingService {
  withSpan<T>(
    name: string,
    attributes: SpanAttributes,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    return withSpan(name, attributes, fn);
  }
}
