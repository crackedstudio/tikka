/**
 * Testing utilities for `@tikka/sdk`, published under the `@tikka/sdk/testing`
 * sub-path.
 *
 * These helpers drive a *configured* SDK service through a complete flow —
 * create a raffle, buy tickets, cancel it — so a consumer's test suite does not
 * have to re-derive the call sequences or the environment-variable defaults.
 * They perform no network I/O of their own: pass in a service wired to a mock
 * RPC, a local standalone network, or testnet, together with
 * {@link MockWalletAdapter} so nothing needs a browser wallet.
 *
 * The SDK's own opt-in testnet suite
 * (`src/test/integration/testnet-integration.spec.ts`) uses the same helpers,
 * so a flow that breaks there breaks for consumers too.
 *
 * ```ts
 * import { createRaffleFlow, buyTicketsFlow } from '@tikka/sdk/testing';
 * import { MockWalletAdapter } from '@tikka/sdk/testing';
 * ```
 *
 * @packageDocumentation
 */

export {
  createRaffleFlow,
  buyTicketsFlow,
  cancelRaffleFlow,
} from './example-flows';

// Re-exported here so a test suite can build a wallet and drive a flow from a
// single import. `MockWalletAdapter` is also part of the main entry point.
export { MockWalletAdapter } from '../wallet/mock-wallet.adapter';
export type { MockWalletOptions } from '../wallet/mock-wallet.adapter';
