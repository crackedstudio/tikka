/**
 * Light entry point for the SDK.
 *
 * A size-optimised subset of the SDK intended for environments where bundle
 * size matters (browsers, edge/serverless runtimes). It exposes the core
 * client and the read-path helpers only, omitting the heavier optional
 * modules that the full entry point (`sdk/index.ts`) ships.
 *
 * When to use which entry point:
 *   - Root import (`from "<pkg>"`): the full SDK. Use this when you need the
 *     complete feature set, including write helpers and extended utilities.
 *   - `./light` (this file): the minimal core + read surface for the smallest
 *     possible bundle.
 *
 * Read and write helpers are also available as tree-shakeable named exports
 * from the full SDK, so they do not require dedicated bundles. See
 * `sdk/README.md` for the full comparison.
 */

export { createClient } from "./client";
export type { ClientOptions } from "./client";

// Read-path primitives are safe to include in the light build: they are
// tree-shakeable and carry no heavy transitive dependencies.
export * from "./read";
