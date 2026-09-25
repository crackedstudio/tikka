/**
 * Node / SSR entry-point guards (#1563)
 *
 * The SDK is published once and consumed from three different runtimes: the
 * browser client, Node services / the CLI (`src/main.ts`, `bin/tikka.cjs`), and
 * SSR renderers. This suite pins the import-side contract:
 *
 * 1. Every public entry point imports in a Node process with no DOM.
 * 2. No browser-only wallet package is evaluated while those barrels load — the
 *    mocks below throw if they are. A barrel that statically imported
 *    `@lobstrco/signer-extension-api` (as `lobstr.adapter.ts` used to) fails
 *    here instead of in a user's SSR worker.
 * 3. Wallet availability is a runtime, typed result that never throws, instead
 *    of a load-time throw or a boolean the caller has to interpret.
 *
 * Jest runs this package with `testEnvironment: 'node'`, so the absence of
 * `window`/`document` is asserted rather than simulated.
 */

jest.mock('@lobstrco/signer-extension-api', () => {
  throw new Error(
    '@lobstrco/signer-extension-api must not be evaluated while importing an SDK entry point',
  );
});

jest.mock('@stellar/freighter-api', () => {
  throw new Error(
    '@stellar/freighter-api must not be evaluated while importing an SDK entry point',
  );
});

jest.mock(
  '@albedo-link/intent',
  () => {
    throw new Error(
      '@albedo-link/intent must not be evaluated while importing an SDK entry point',
    );
  },
  { virtual: true },
);

import {
  WalletAdapter,
  WalletAvailabilityCode,
  WalletName,
} from '../wallet/wallet.interface';
import {
  AlbedoAdapter,
  FreighterAdapter,
  LobstrAdapter,
  MockWalletAdapter,
  RabetAdapter,
  XBullAdapter,
} from '../wallet';
import { isBrowserEnvironment, isNodeEnvironment } from '../utils/environment';

/** Every barrel a consumer can import from in this package. */
const ENTRY_POINTS = [
  '../index',
  '../index.read',
  '../index.light',
  '../index.write',
  '../light',
  '../wallet',
];

describe('Node / SSR entry points (#1563)', () => {
  it('runs in a process without DOM globals', () => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;

    expect(typeof (globalThis as any).window).toBe('undefined');
    expect(typeof (globalThis as any).document).toBe('undefined');
    expect(isBrowserEnvironment()).toBe(false);
    expect(isNodeEnvironment()).toBe(true);
  });

  it.each(ENTRY_POINTS)('imports %s without throwing', async (entryPoint) => {
    // A throw here means a module in the graph touched `window`/`document` or
    // evaluated a browser-only package at load time.
    const entry = await import(entryPoint);

    expect(entry).toBeDefined();
    expect(typeof entry).toBe('object');
  });

  it('keeps the wallet contract usable in Node', async () => {
    const wallet = await import('../wallet');

    expect(typeof wallet.WalletAdapter).toBe('function');
    expect(new FreighterAdapter().getCapabilities().supportsSignTransaction).toBe(true);
    expect(new MockWalletAdapter().isAvailable()).toBe(true);
  });

  it('reports browser wallets as unavailable without throwing', () => {
    const browserOnly: WalletAdapter[] = [
      new FreighterAdapter(),
      new XBullAdapter(),
      new AlbedoAdapter(),
      new LobstrAdapter(),
      new RabetAdapter(),
    ];

    for (const adapter of browserOnly) {
      expect(adapter.isAvailable()).toBe(false);

      const availability = adapter.checkAvailability();

      expect(availability.available).toBe(false);
      expect(availability.code).toBe(WalletAvailabilityCode.UnsupportedEnvironment);
      expect(availability.message.length).toBeGreaterThan(0);
    }
  });

  it('reports the mock adapter as available in Node', () => {
    const availability = new MockWalletAdapter().checkAvailability();

    expect(availability.available).toBe(true);
    expect(availability.code).toBe(WalletAvailabilityCode.Available);
  });

  it('keeps checkAvailability() consistent with isAvailable() everywhere', () => {
    const adapters = [
      new FreighterAdapter(),
      new XBullAdapter(),
      new AlbedoAdapter(),
      new LobstrAdapter(),
      new RabetAdapter(),
      new MockWalletAdapter(),
    ];

    for (const adapter of adapters) {
      expect(adapter.checkAvailability().available).toBe(adapter.isAvailable());
    }

    expect(adapters.map((adapter) => adapter.name)).toEqual([
      WalletName.Freighter,
      WalletName.XBull,
      WalletName.Albedo,
      WalletName.LOBSTR,
      WalletName.Rabet,
      WalletName.Mock,
    ]);
  });
});
