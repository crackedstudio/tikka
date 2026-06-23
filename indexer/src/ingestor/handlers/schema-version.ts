import { RawSorobanEvent } from "../event-parser.interface";

/**
 * Contract event schema versioning.
 *
 * Every Tikka contract event carries an explicit schema version so that future
 * contract changes (new fields, re-ordered topics) can introduce a new version
 * without breaking ingestion of historically-emitted events.
 *
 * Today all events are at v1. When a contract emits a new schema, bump
 * {@link CURRENT_SCHEMA_VERSION}, add the old version to
 * {@link SUPPORTED_SCHEMA_VERSIONS}, and register a version-specific handler so
 * both old and new events keep decoding.
 */

/** The schema version emitted by the current contract build. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Schema versions this indexer build can decode. */
export const SUPPORTED_SCHEMA_VERSIONS: ReadonlySet<number> = new Set<number>([
  1,
]);

/** Returns true when `version` is a positive integer this build supports. */
export function isSupportedSchemaVersion(version: number): boolean {
  return Number.isInteger(version) && SUPPORTED_SCHEMA_VERSIONS.has(version);
}

/**
 * Resolves the schema version for a raw event.
 *
 * Prefers an explicit `schemaVersion` / `schema_version` field on the raw
 * event (used by newer contracts and tests); otherwise defaults to
 * {@link CURRENT_SCHEMA_VERSION}. This is the single place version detection
 * evolves as contracts add versioning topics.
 */
export function resolveSchemaVersion(
  rawEvent: RawSorobanEvent | Record<string, unknown>,
): number {
  const raw = rawEvent as Record<string, unknown>;
  const explicit = raw.schemaVersion ?? raw.schema_version;
  if (explicit !== undefined && explicit !== null) {
    const parsed = Number(explicit);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Raised when an event declares a schema version this build cannot decode.
 * Carries the offending version (and event type) so the failure can be
 * dead-lettered with an actionable reason.
 */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public readonly schemaVersion: number,
    public readonly eventType?: string,
  ) {
    super(
      `Unsupported schema version ${schemaVersion}${eventType ? ` for event ${eventType}` : ""} (supported: ${[...SUPPORTED_SCHEMA_VERSIONS].join(", ")})`,
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

/**
 * Throws {@link UnsupportedSchemaVersionError} if `version` is not supported.
 * Returns the version unchanged when supported.
 */
export function assertSupportedSchemaVersion(
  version: number,
  eventType?: string,
): number {
  if (!isSupportedSchemaVersion(version)) {
    throw new UnsupportedSchemaVersionError(version, eventType);
  }
  return version;
}
