/**
 * Runtime environment guards.
 *
 * The SDK is published once and runs in three very different places: the
 * browser client, Node services / the CLI (`src/main.ts`, `bin/tikka.cjs`),
 * and SSR or edge renderers. Wallet adapters may only touch `window`,
 * `document`, or an injected extension global *at call time* — never while a
 * module is being evaluated, and never through a statically imported
 * browser-only package. Otherwise importing an entry point in Node throws
 * before the caller has any chance to decide what to do.
 *
 * Every such read goes through the helpers below:
 * - they never reference `window` / `document` as bare identifiers (a bare
 *   reference throws in a runtime without that global, and bundlers may keep
 *   it even inside a `typeof` guard),
 * - they keep working when `globalThis` itself is missing, and
 * - they turn "is this actually usable here?" into a value the caller can
 *   branch on instead of an exception.
 *
 * This module is intentionally not re-exported from `utils/index.ts`: the
 * public, typed answer for wallet consumers is the non-throwing
 * `WalletAdapter.checkAvailability()` result.
 */

/** The global object, or `undefined` in a runtime that does not expose one. */
export function getGlobalObject(): typeof globalThis | undefined {
  return typeof globalThis === 'undefined' ? undefined : globalThis;
}

/**
 * Reads a property off the global object without throwing.
 *
 * Returns `undefined` when the global object or the property is absent.
 *
 * @example
 * ```ts
 * const rabet = getGlobalProperty<{ connect(): Promise<unknown> }>('rabet');
 * ```
 */
export function getGlobalProperty<T = unknown>(key: string): T | undefined {
  const globalObject: unknown = getGlobalObject();
  if (globalObject === undefined || globalObject === null) {
    return undefined;
  }
  const value = (globalObject as Record<string, unknown>)[key];
  return value as T | undefined;
}

/**
 * True when the global object carries a non-`undefined` `key` — for example an
 * injected `window.rabet` or `window.freighter` extension bridge. An
 * extension that never defines its global leaves the property missing, so a
 * missing key and a key set to `undefined` are treated the same.
 */
export function hasGlobalProperty(key: string): boolean {
  return getGlobalProperty(key) !== undefined;
}

/**
 * True in a real browser: both `window` and `document` are present.
 *
 * A pre-render (SSR) pass, a React Native runtime, and a Node test process all
 * return `false`.
 */
export function isBrowserEnvironment(): boolean {
  return hasGlobalProperty('window') && hasGlobalProperty('document');
}

/**
 * True under Node (or a Node-compatible runtime) outside of a browser
 * document — the environment the CLI, NestJS services, and SSR bundlers use.
 */
export function isNodeEnvironment(): boolean {
  if (isBrowserEnvironment()) {
    return false;
  }
  const nodeProcess = getGlobalProperty<{ versions?: { node?: unknown } }>('process');
  return typeof nodeProcess?.versions?.node === 'string';
}
