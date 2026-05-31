import * as fs from "fs";
import * as path from "path";
import { ContractConfig } from "./event-handler.interface";

/**
 * Root shape of `config/event-handlers.json`.
 */
export interface RootHandlerConfig {
  contracts: ContractConfig[];
  defaultHandlers?: Record<string, string>;
}

/**
 * Canonical Tikka contract event names (the `DomainEvent` discriminants).
 * An event is "known" if it is one of these or is handled by a registered
 * handler (see {@link buildValidationContext}).
 */
export const KNOWN_EVENT_NAMES = [
  "RaffleCreated",
  "TicketPurchased",
  "DrawTriggered",
  "RandomnessRequested",
  "RandomnessReceived",
  "RaffleFinalized",
  "RaffleCancelled",
  "TicketRefunded",
  "ContractPaused",
  "ContractUnpaused",
  "AdminTransferProposed",
  "AdminTransferAccepted",
] as const;

/** Contract schema versions the indexer can route. */
export const SUPPORTED_SCHEMA_VERSIONS = ["v1", "v2"] as const;

/**
 * Context the validator checks the config against. Supplied at boot from the
 * handlers that are actually registered, so the config can only reference
 * handlers/events that really exist.
 */
export interface ConfigValidationContext {
  /** Event names the indexer recognises. */
  knownEventNames: ReadonlySet<string>;
  /** Map of available handler class name -> the event name it handles. */
  availableHandlers: ReadonlyMap<string, string>;
  /** Supported contract schema versions. */
  supportedVersions: ReadonlySet<string>;
}

/**
 * Thrown when the event handler config is structurally or referentially
 * invalid. The message lists every problem so operators can fix them in one
 * pass rather than discovering them one boot at a time.
 */
export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid event handler config (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n  - ${issues.join("\n  - ")}`,
    );
    this.name = "ConfigValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a parsed event handler config against the runtime context.
 * Returns a list of human-readable issues (empty when the config is valid).
 *
 * Enabled contracts and `defaultHandlers` are fully reference-checked (handlers
 * must exist, events must be known, versions must be supported). Disabled
 * contracts are only structurally checked so inactive templates do not block
 * boot.
 */
export function validateEventHandlerConfig(
  config: unknown,
  ctx: ConfigValidationContext,
): string[] {
  const issues: string[] = [];

  if (!isPlainObject(config)) {
    return ["config root must be an object"];
  }

  if (!Array.isArray(config.contracts)) {
    issues.push("`contracts` must be an array");
  } else {
    config.contracts.forEach((contract, i) => {
      validateContract(contract, i, ctx, issues);
    });
  }

  if (config.defaultHandlers !== undefined) {
    if (!isPlainObject(config.defaultHandlers)) {
      issues.push("`defaultHandlers` must be an object");
    } else {
      for (const [eventName, handlerName] of Object.entries(
        config.defaultHandlers,
      )) {
        validateMapping(eventName, handlerName, "defaultHandlers", ctx, issues);
      }
    }
  }

  return issues;
}

function validateContract(
  contract: unknown,
  index: number,
  ctx: ConfigValidationContext,
  issues: string[],
): void {
  const where = `contracts[${index}]`;

  if (!isPlainObject(contract)) {
    issues.push(`${where} must be an object`);
    return;
  }

  const address = contract.address;
  if (typeof address !== "string" || address.trim() === "") {
    issues.push(`${where}.address must be a non-empty string`);
  }

  const label = typeof address === "string" ? `${where} (${address})` : where;

  if (typeof contract.version !== "string") {
    issues.push(`${label}.version must be a string`);
  } else if (!ctx.supportedVersions.has(contract.version)) {
    issues.push(
      `${label}.version "${contract.version}" is not supported (supported: ${[...ctx.supportedVersions].join(", ")})`,
    );
  }

  if (typeof contract.enabled !== "boolean") {
    issues.push(`${label}.enabled must be a boolean`);
  }

  if (
    contract.eventHandlers !== undefined &&
    !isPlainObject(contract.eventHandlers)
  ) {
    issues.push(`${label}.eventHandlers must be an object`);
    return;
  }

  // Only reference-check active contracts; disabled contracts may be templates
  // for handlers that are not wired in yet.
  if (contract.enabled === true && isPlainObject(contract.eventHandlers)) {
    for (const [eventName, handlerName] of Object.entries(
      contract.eventHandlers,
    )) {
      validateMapping(eventName, handlerName, label, ctx, issues);
    }
  }
}

function validateMapping(
  eventName: string,
  handlerName: unknown,
  where: string,
  ctx: ConfigValidationContext,
  issues: string[],
): void {
  if (!ctx.knownEventNames.has(eventName)) {
    issues.push(`${where}: unknown event "${eventName}"`);
  }

  if (typeof handlerName !== "string" || handlerName.trim() === "") {
    issues.push(
      `${where}: handler for "${eventName}" must be a non-empty string`,
    );
    return;
  }

  if (!ctx.availableHandlers.has(handlerName)) {
    issues.push(
      `${where}: handler "${handlerName}" for event "${eventName}" does not exist`,
    );
    return;
  }

  const handledEvent = ctx.availableHandlers.get(handlerName);
  if (handledEvent !== eventName) {
    issues.push(
      `${where}: handler "${handlerName}" handles "${handledEvent}", not "${eventName}"`,
    );
  }
}

/**
 * Validates the config and throws {@link ConfigValidationError} if it is
 * invalid. Returns the config typed as {@link RootHandlerConfig} on success.
 */
export function assertValidEventHandlerConfig(
  config: unknown,
  ctx: ConfigValidationContext,
): RootHandlerConfig {
  const issues = validateEventHandlerConfig(config, ctx);
  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
  return config as RootHandlerConfig;
}

/**
 * Reads and JSON-parses the config file at `configPath` (resolved against the
 * current working directory). Returns `null` when the file does not exist.
 * Throws {@link ConfigValidationError} when the file exists but is not valid
 * JSON.
 */
export function loadEventHandlerConfigFile(configPath: string): unknown | null {
  const fullPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(fullPath, "utf8");
  } catch (error) {
    throw new ConfigValidationError([
      `could not read config file at ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ConfigValidationError([
      `config file at ${fullPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

/**
 * Builds a validation context from the registered handlers, so the config can
 * only reference handlers and events that actually exist at runtime.
 *
 * @param availableHandlers map of handler class name -> the event it handles.
 */
export function buildValidationContext(
  availableHandlers: ReadonlyMap<string, string>,
): ConfigValidationContext {
  const knownEventNames = new Set<string>([
    ...KNOWN_EVENT_NAMES,
    ...availableHandlers.values(),
  ]);

  return {
    knownEventNames,
    availableHandlers,
    supportedVersions: new Set<string>(SUPPORTED_SCHEMA_VERSIONS),
  };
}

/**
 * Default config used when no external config file is present. Mirrors the
 * shipped `config/event-handlers.json` main contract so ingestion works out of
 * the box. Always passes validation against the standard handlers.
 */
export const DEFAULT_EVENT_HANDLER_CONFIG: RootHandlerConfig = {
  contracts: [
    {
      address: "default",
      version: "v1",
      description: "Default raffle contract",
      enabled: true,
      eventHandlers: {
        RaffleCreated: "RaffleCreatedHandler",
        TicketPurchased: "TicketPurchasedHandler",
        DrawTriggered: "DrawTriggeredHandler",
        RandomnessRequested: "RandomnessRequestedHandler",
        RandomnessReceived: "RandomnessReceivedHandler",
        RaffleFinalized: "RaffleFinalizedHandler",
        RaffleCancelled: "RaffleCancelledHandler",
        TicketRefunded: "TicketRefundedHandler",
        ContractPaused: "ContractPausedHandler",
        ContractUnpaused: "ContractUnpausedHandler",
        AdminTransferProposed: "AdminTransferProposedHandler",
        AdminTransferAccepted: "AdminTransferAcceptedHandler",
      },
    },
  ],
};
