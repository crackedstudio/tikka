import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { Logger } from "@nestjs/common";
import { IEventHandler } from "../event-handler.interface";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { resolveSchemaVersion } from "./schema-version";

/**
 * Base class for event handlers providing common utilities
 */
export abstract class BaseEventHandler implements IEventHandler {
  protected readonly logger: Logger;

  constructor(
    public readonly eventName: string,
    loggerContext?: string,
  ) {
    this.logger = new Logger(loggerContext || this.constructor.name);
  }

  abstract parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null;

  /**
   * Safely convert ScVal to native value
   */
  protected toNative(scVal: xdr.ScVal): any {
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
   * Safely extract number from ScVal
   */
  protected toNumber(scVal: xdr.ScVal): number | null {
    const native = this.toNative(scVal);
    if (native === null) return null;
    return Number(native);
  }

  /**
   * Safely extract string from ScVal
   */
  protected toString(scVal: xdr.ScVal): string | null {
    const native = this.toNative(scVal);
    if (native === null) return null;
    return String(native);
  }

  /**
   * Resolve the schema version for the event being parsed. Handlers should tag
   * their returned `DomainEvent` with this so the version is persisted and
   * routed consistently (see `schema-version.ts`).
   */
  protected schemaVersion(rawEvent: RawSorobanEvent): number {
    return resolveSchemaVersion(rawEvent);
  }

  /**
   * Safely extract buffer as hex string
   */
  protected toHexString(buffer: any): string {
    if (Buffer.isBuffer(buffer)) {
      return buffer.toString("hex");
    }
    if (buffer instanceof Uint8Array) {
      return Buffer.from(buffer).toString("hex");
    }
    return String(buffer);
  }
}
