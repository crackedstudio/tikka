import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { Logger } from "@nestjs/common";
import { IEventHandler } from "../event-handler.interface";
import { DomainEvent, EventPayload } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { resolveSchemaVersion } from "./schema-version";
import {
  asHex,
  asNumber,
  asNumberArray,
  asRecord,
  asString,
} from "./decode-utils";

/**
 * Typed base class for contract event handlers.
 *
 * Subclasses pick their exact event variant (`BaseEventHandler<RaffleCreatedEvent>`)
 * and implement {@link BaseEventHandler.decode} to produce that variant's
 * *payload* — the base class then narrows once: it stamps the `type`
 * discriminant (the topic this handler is registered for) and the
 * `schemaVersion` resolved by `schema-version.ts`, wraps failures, and
 * returns the fully typed event. Handlers never re-narrow the same payload
 * by hand and never touch `any`.
 *
 * Versioning: the version is resolved from the raw event (legacy events
 * default to v1), *not* asserted here — unsupported versions still parse so
 * the dispatcher can dead-letter them with `SCHEMA_UNSUPPORTED` instead of
 * the event being silently dropped by a mis-routed handler.
 */
export abstract class BaseEventHandler<E extends DomainEvent = DomainEvent>
  implements IEventHandler<E>
{
  protected readonly logger: Logger;

  constructor(
    public readonly eventName: E["type"],
    loggerContext?: string,
  ) {
    this.logger = new Logger(loggerContext || this.constructor.name);
  }

  /**
   * Parse the raw event into the handler's exact typed event variant.
   *
   * Template method: resolves and stamps the schema version, delegates the
   * payload decode to {@link BaseEventHandler.decode}, and never throws.
   */
  public parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): E | null {
    try {
      const schemaVersion = resolveSchemaVersion(rawEvent);
      const payload = this.decode(topics, value, rawEvent);
      if (payload === null) return null;
      // Sound by construction: `type` is this handler's registered topic and
      // `payload` is exactly `Omit<E, "type" | "schemaVersion">`.
      return { type: this.eventName, schemaVersion, ...payload } as E;
    } catch (error) {
      this.logger.error(
        `Error parsing ${this.eventName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Decode the payload of this handler's event variant from the decoded XDR
   * topics/value. Return `null` (never throw) when required data is missing.
   */
  protected abstract decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): EventPayload<E> | null;

  /**
   * Safely convert an ScVal to a native value (typed as `unknown`).
   */
  protected toNative(scVal: xdr.ScVal): unknown {
    try {
      return scValToNative(scVal);
    } catch (error) {
      this.logger.warn(
        `Failed to convert ScVal to native: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Safely extract a number from an ScVal.
   */
  protected toNumber(scVal: xdr.ScVal): number | null {
    return asNumber(this.toNative(scVal));
  }

  /**
   * Safely extract a string from an ScVal.
   */
  protected toString(scVal: xdr.ScVal): string | null {
    return asString(this.toNative(scVal));
  }

  /**
   * Safely extract a Soroban map payload as a plain record.
   */
  protected toRecord(scVal: xdr.ScVal): Record<string, unknown> | null {
    return asRecord(this.toNative(scVal));
  }

  /**
   * Safely extract an array of numbers from an ScVal.
   */
  protected toNumberArray(scVal: xdr.ScVal): number[] | null {
    return asNumberArray(this.toNative(scVal));
  }

  /**
   * Safely extract a buffer as hex string.
   */
  protected toHexString(value: unknown): string {
    return asHex(value);
  }
}
