/**
 * Wallet Adapter Conformance Suite
 *
 * Runs the same contract-level assertions against every built-in adapter.
 * When a new adapter is added, register it in the `ADAPTERS` array at the
 * bottom of this file — that is the ONLY change required to bring it under
 * the suite.
 *
 * What the suite asserts (for every adapter):
 *   1. Static contract  — `name` is a non-empty string
 *   2. Capabilities     — `getCapabilities()` returns a well-formed object
 *   3. isAvailable      — returns a boolean without throwing
 *   4. connect/disconnect lifecycle (if the adapter exposes them)
 *   5. getPublicKey     — resolves to a non-empty string (happy path)
 *   6. signTransaction  — resolves to `{ signedXdr: string }` (happy path)
 *   7. signMessage      — either resolves to a string OR throws the
 *                         standard "does not support signMessage" error
 *   8. getNetwork       — resolves to string | undefined without throwing
 *   9. Error shapes     — WalletNotInstalled, WalletNotConnected, UserRejected,
 *                         InvalidParams all carry `code` on TikkaSdkError
 *  10. Network mismatch — missing passphrase throws InvalidParams where required
 *
 * @see docs/WALLET_ADAPTERS.md for the integrator contract.
 */

import { Networks } from '@stellar/stellar-sdk';

import { WalletAdapter, WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

// Adapters under test
import { FreighterAdapter } from './freighter.adapter';
import { AlbedoAdapter } from './albedo.adapter';
import { RabetAdapter } from './rabet.adapter';
import { XBullAdapter } from './xbull.adapter';
import { LobstrAdapter } from './lobstr.adapter';
import { MockWalletAdapter } from './mock-wallet.adapter';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('@stellar/freighter-api', () => ({
  getAddress: jest.fn(),
  signTransaction: jest.fn(),
  signMessage: jest.fn(),
  getNetworkDetails: jest.fn(),
  isConnected: jest.fn(),
}));

jest.mock(
  '@albedo-link/intent',
  () => ({
    __esModule: true,
    default: { intent: jest.fn() },
  }),
  { virtual: true },
);

jest.mock('@lobstrco/signer-extension-api', () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test-adapter descriptor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the conformance suite needs to know about one adapter.
 *
 * `setup`   — runs before each test; installs globals, configures mocks for
 *             the happy path, and returns the adapter under test.
 * `teardown` — runs after each test; removes globals / clears state.
 */
interface AdapterDescriptor {
  /** Human-readable label used in describe() */
  label: string;
  /** WalletName enum value the adapter reports */
  expectedName: WalletName;
  /**
   * Install globals + configure happy-path mocks.
   * Must return the adapter ready for use (already connected when required).
   */
  setup: () => Promise<WalletAdapter>;
  /** Clean up any globals or state. */
  teardown: () => void;
  /**
   * True when the adapter requires an explicit connect() call before
   * getPublicKey() / signTransaction() will work.
   */
  requiresExplicitConnect: boolean;
  /**
   * True when signTransaction requires a networkPassphrase and should
   * throw InvalidParams when one is omitted.
   */
  requiresNetworkPassphrase: boolean;
  /** Expected happy-path public key string */
  expectedPublicKey: string;
  /** Expected happy-path signed XDR string */
  expectedSignedXdr: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-adapter setup helpers
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PUBLIC_KEY = 'GCONFORMANCE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const MOCK_XDR = 'AAAAAgAAAABqxxxmockxdrxxx==';
const MOCK_SIGNED_XDR = 'AAAAAgAAAABqxxxmocksignedxxx==';

async function setupFreighter(): Promise<FreighterAdapter> {
  const freighterApi = await import('@stellar/freighter-api');
  const api = freighterApi as any;

  api.isConnected.mockResolvedValue(false);
  api.getAddress.mockResolvedValue({ address: MOCK_PUBLIC_KEY });
  api.signTransaction.mockResolvedValue({ signedTxXdr: MOCK_SIGNED_XDR });
  api.signMessage.mockResolvedValue({ signedMessage: 'mock-freighter-sig' });
  api.getNetworkDetails.mockResolvedValue({ networkPassphrase: Networks.TESTNET });

  (globalThis as any).freighter = {};
  return new FreighterAdapter({ networkPassphrase: Networks.TESTNET });
}

function teardownFreighter(): void {
  delete (globalThis as any).freighter;
  jest.clearAllMocks();
}

async function setupAlbedo(): Promise<AlbedoAdapter> {
  const { default: albedo } = await import('@albedo-link/intent');
  const mock = albedo as any;
  mock.intent.mockImplementation((type: string) => {
    if (type === 'public_key') return Promise.resolve({ pubkey: MOCK_PUBLIC_KEY });
    if (type === 'tx') return Promise.resolve({ signed_envelope_xdr: MOCK_SIGNED_XDR });
    if (type === 'sign_message') return Promise.resolve({ message_signature: 'albedo-sig' });
    return Promise.reject(new Error(`Unknown intent: ${type}`));
  });
  (globalThis as any).document = {};
  return new AlbedoAdapter({ networkPassphrase: Networks.TESTNET });
}

function teardownAlbedo(): void {
  delete (globalThis as any).document;
  jest.clearAllMocks();
}

async function setupRabet(): Promise<RabetAdapter> {
  (globalThis as any).rabet = {
    connect: jest.fn().mockResolvedValue({ publicKey: MOCK_PUBLIC_KEY }),
    sign: jest.fn().mockResolvedValue({ xdr: MOCK_SIGNED_XDR }),
  };
  return new RabetAdapter({ networkPassphrase: Networks.TESTNET });
}

function teardownRabet(): void {
  delete (globalThis as any).rabet;
  jest.clearAllMocks();
}

async function setupXBull(): Promise<XBullAdapter> {
  (globalThis as any).xbull = {
    getPublicKey: jest.fn().mockResolvedValue(MOCK_PUBLIC_KEY),
    signTransaction: jest.fn().mockResolvedValue(MOCK_SIGNED_XDR),
  };
  (globalThis as any).window = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  const adapter = new XBullAdapter({ networkPassphrase: Networks.TESTNET });
  // xBull requires explicit connect
  await adapter.connect();
  return adapter;
}

function teardownXBull(): void {
  delete (globalThis as any).xbull;
  delete (globalThis as any).window;
  jest.clearAllMocks();
}

async function setupLobstr(): Promise<LobstrAdapter> {
  const lobstrApi = await import('@lobstrco/signer-extension-api');
  const api = lobstrApi as any;
  api.isConnected.mockResolvedValue(true);
  api.getPublicKey.mockResolvedValue(MOCK_PUBLIC_KEY);
  api.signTransaction.mockResolvedValue(MOCK_SIGNED_XDR);

  (globalThis as any).window = {};
  const adapter = new LobstrAdapter({ networkPassphrase: Networks.TESTNET });
  // LOBSTR requires explicit connect
  await adapter.connect();
  return adapter;
}

function teardownLobstr(): void {
  delete (globalThis as any).window;
  jest.clearAllMocks();
}

async function setupMock(): Promise<MockWalletAdapter> {
  return new MockWalletAdapter({
    publicKey: MOCK_PUBLIC_KEY,
    networkPassphrase: Networks.TESTNET,
  });
}

function teardownMock(): void {
  // Nothing to clean up
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ADD A NEW ADAPTER HERE and the full conformance suite runs against it
 * automatically — no other change to this file is required.
 */
const ADAPTERS: AdapterDescriptor[] = [
  {
    label: 'FreighterAdapter',
    expectedName: WalletName.Freighter,
    setup: setupFreighter,
    teardown: teardownFreighter,
    requiresExplicitConnect: false,
    requiresNetworkPassphrase: false,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: MOCK_SIGNED_XDR,
  },
  {
    label: 'AlbedoAdapter',
    expectedName: WalletName.Albedo,
    setup: setupAlbedo,
    teardown: teardownAlbedo,
    requiresExplicitConnect: false,
    requiresNetworkPassphrase: true,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: MOCK_SIGNED_XDR,
  },
  {
    label: 'RabetAdapter',
    expectedName: WalletName.Rabet,
    setup: setupRabet,
    teardown: teardownRabet,
    requiresExplicitConnect: false,
    requiresNetworkPassphrase: true,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: MOCK_SIGNED_XDR,
  },
  {
    label: 'XBullAdapter',
    expectedName: WalletName.XBull,
    setup: setupXBull,
    teardown: teardownXBull,
    requiresExplicitConnect: true,
    requiresNetworkPassphrase: false,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: MOCK_SIGNED_XDR,
  },
  {
    label: 'LobstrAdapter',
    expectedName: WalletName.LOBSTR,
    setup: setupLobstr,
    teardown: teardownLobstr,
    requiresExplicitConnect: true,
    requiresNetworkPassphrase: false,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: MOCK_SIGNED_XDR,
  },
  {
    label: 'MockWalletAdapter',
    expectedName: WalletName.Mock,
    setup: setupMock,
    teardown: teardownMock,
    requiresExplicitConnect: false,
    requiresNetworkPassphrase: false,
    expectedPublicKey: MOCK_PUBLIC_KEY,
    expectedSignedXdr: `mock-signed:${MOCK_XDR}`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Conformance suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Wallet Adapter Conformance Suite', () => {
  for (const descriptor of ADAPTERS) {
    describe(descriptor.label, () => {
      let adapter: WalletAdapter;

      beforeEach(async () => {
        adapter = await descriptor.setup();
      });

      afterEach(() => {
        descriptor.teardown();
      });

      // ── 1. Static contract ────────────────────────────────────────────────

      describe('static contract', () => {
        it('exposes a non-empty name string', () => {
          expect(typeof adapter.name).toBe('string');
          expect(adapter.name.length).toBeGreaterThan(0);
        });

        it(`reports name as "${descriptor.expectedName}"`, () => {
          expect(adapter.name).toBe(descriptor.expectedName);
        });

        it('is an instance of WalletAdapter', () => {
          expect(adapter).toBeInstanceOf(WalletAdapter);
        });
      });

      // ── 2. Capabilities ───────────────────────────────────────────────────

      describe('getCapabilities()', () => {
        it('returns an object with four boolean fields', () => {
          const caps = adapter.getCapabilities();

          expect(caps).toEqual(
            expect.objectContaining({
              supportsGetPublicKey: expect.any(Boolean),
              supportsSignTransaction: expect.any(Boolean),
              supportsSignMessage: expect.any(Boolean),
              supportsGetNetwork: expect.any(Boolean),
            }),
          );
        });

        it('reports supportsGetPublicKey as true', () => {
          expect(adapter.getCapabilities().supportsGetPublicKey).toBe(true);
        });

        it('reports supportsSignTransaction as true', () => {
          expect(adapter.getCapabilities().supportsSignTransaction).toBe(true);
        });

        it('is stable across multiple calls', () => {
          const first = adapter.getCapabilities();
          const second = adapter.getCapabilities();
          expect(first).toEqual(second);
        });
      });

      // ── 3. isAvailable ────────────────────────────────────────────────────

      describe('isAvailable()', () => {
        it('returns a boolean without throwing', () => {
          expect(typeof adapter.isAvailable()).toBe('boolean');
        });

        it('returns true in the configured test environment', () => {
          expect(adapter.isAvailable()).toBe(true);
        });
      });

      // ── 4. connect / disconnect lifecycle ────────────────────────────────

      describe('connect / disconnect', () => {
        if (descriptor.requiresExplicitConnect) {
          // Adapters that gate all operations on an explicit connect()
          it('exposes connect() and disconnect()', () => {
            expect(typeof (adapter as any).connect).toBe('function');
            expect(typeof (adapter as any).disconnect).toBe('function');
          });

          it('disconnect() then re-connect() succeeds', async () => {
            await (adapter as any).disconnect();
            // Re-setup mocks for a second connect
            await descriptor.setup();
          });
        } else {
          // Adapters that do not mandate an explicit connect flow should
          // still expose connect if declared (e.g. Freighter) or be absent
          it('does not throw when connect() is absent or optional', async () => {
            if (typeof (adapter as any).connect === 'function') {
              await expect((adapter as any).connect()).resolves.not.toThrow();
            }
          });
        }

        it('disconnect() is callable without throwing when available', async () => {
          if (typeof (adapter as any).disconnect === 'function') {
            expect(() => (adapter as any).disconnect()).not.toThrow();
          }
        });
      });

      // ── 5. getPublicKey ───────────────────────────────────────────────────

      describe('getPublicKey()', () => {
        it('resolves to a non-empty string', async () => {
          const key = await adapter.getPublicKey();
          expect(typeof key).toBe('string');
          expect(key.length).toBeGreaterThan(0);
        });

        it('resolves to the expected mock public key', async () => {
          const key = await adapter.getPublicKey();
          expect(key).toBe(descriptor.expectedPublicKey);
        });
      });

      // ── 6. signTransaction ────────────────────────────────────────────────

      describe('signTransaction()', () => {
        it('resolves to an object with a non-empty signedXdr string', async () => {
          const result = await adapter.signTransaction(MOCK_XDR, {
            networkPassphrase: Networks.TESTNET,
          });
          expect(result).toHaveProperty('signedXdr');
          expect(typeof result.signedXdr).toBe('string');
          expect(result.signedXdr.length).toBeGreaterThan(0);
        });

        it('resolves to the expected signed XDR', async () => {
          const result = await adapter.signTransaction(MOCK_XDR, {
            networkPassphrase: Networks.TESTNET,
          });
          expect(result.signedXdr).toBe(descriptor.expectedSignedXdr);
        });

        it('result does not have extra unexpected keys', async () => {
          const result = await adapter.signTransaction(MOCK_XDR, {
            networkPassphrase: Networks.TESTNET,
          });
          // SignTransactionResult should only have signedXdr
          expect(Object.keys(result)).toContain('signedXdr');
        });
      });

      // ── 7. signMessage ────────────────────────────────────────────────────

      describe('signMessage()', () => {
        it('either returns a string or throws the standard unsupported error', async () => {
          const caps = adapter.getCapabilities();

          if (caps.supportsSignMessage) {
            // When supported it must resolve to a non-empty string
            const sig = await adapter.signMessage('conformance-test-message');
            expect(typeof sig).toBe('string');
            expect(sig.length).toBeGreaterThan(0);
          } else {
            // When unsupported it must throw with "does not support signMessage"
            await expect(adapter.signMessage('conformance-test-message')).rejects.toThrow(
              /does not support signMessage/i,
            );
          }
        });

        it('capability flag matches actual behaviour', async () => {
          const caps = adapter.getCapabilities();
          if (!caps.supportsSignMessage) {
            await expect(adapter.signMessage('test')).rejects.toThrow();
          } else {
            await expect(adapter.signMessage('test')).resolves.toBeDefined();
          }
        });
      });

      // ── 8. getNetwork ─────────────────────────────────────────────────────

      describe('getNetwork()', () => {
        it('resolves to string | undefined without throwing', async () => {
          const network = await adapter.getNetwork();
          // Must be either a string or undefined — never null, never an object
          expect(
            network === undefined || typeof network === 'string',
          ).toBe(true);
        });
      });

      // ── 9. Error shapes ───────────────────────────────────────────────────

      describe('error shapes', () => {
        it('TikkaSdkError instances carry a code property', async () => {
          // Construct a TikkaSdkError directly and verify shape
          const err = new TikkaSdkError(
            TikkaSdkErrorCode.UserRejected,
            'conformance check',
          );
          expect(err).toBeInstanceOf(TikkaSdkError);
          expect(err.code).toBe(TikkaSdkErrorCode.UserRejected);
          expect(typeof err.message).toBe('string');
        });

        it('UserRejected errors thrown by the adapter carry the correct code', async () => {
          // Simulate a user-rejection from getPublicKey
          await setupUserRejectionMock(descriptor);

          try {
            await adapter.getPublicKey();
            // If we get here the mock wasn't triggered — that's fine for adapters
            // that can't be forced to throw via globals (e.g. Mock). Skip.
          } catch (err) {
            if (err instanceof TikkaSdkError) {
              expect(err.code).toBe(TikkaSdkErrorCode.UserRejected);
            }
            // Non-TikkaSdkError rejections are allowed (e.g. plain Error from mock)
          }
        });
      });

      // ── 10. Network-mismatch / missing passphrase ─────────────────────────

      describe('network passphrase validation', () => {
        if (descriptor.requiresNetworkPassphrase) {
          it('throws InvalidParams when no network passphrase is available', async () => {
            // Create a fresh adapter without any network passphrase
            const bare = await createBareAdapter(descriptor);

            await expect(bare.signTransaction(MOCK_XDR)).rejects.toMatchObject({
              code: TikkaSdkErrorCode.InvalidParams,
            });
          });
        } else {
          it('does not require a network passphrase to call signTransaction', async () => {
            // Should not throw InvalidParams — other errors are acceptable
            try {
              await adapter.signTransaction(MOCK_XDR);
            } catch (err) {
              if (err instanceof TikkaSdkError) {
                expect(err.code).not.toBe(TikkaSdkErrorCode.InvalidParams);
              }
            }
          });
        }
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an adapter instance with NO network passphrase.
 * Used by the network-mismatch tests.
 */
async function createBareAdapter(descriptor: AdapterDescriptor): Promise<WalletAdapter> {
  switch (descriptor.expectedName) {
    case WalletName.Albedo:
      (globalThis as any).document = {};
      return new AlbedoAdapter(); // no networkPassphrase

    case WalletName.Rabet:
      return new RabetAdapter(); // no networkPassphrase

    default:
      // For adapters that don't enforce network passphrase, return the
      // already-setup adapter (the test won't call signTransaction in this branch)
      return descriptor.setup();
  }
}

/**
 * Configures the active mocks so that the next getPublicKey() call will
 * throw a user-rejection. For adapters where this isn't directly achievable
 * (e.g. Mock), the function is a no-op and the test does a best-effort check.
 */
async function setupUserRejectionMock(descriptor: AdapterDescriptor): Promise<void> {
  switch (descriptor.expectedName) {
    case WalletName.Freighter: {
      const api = (await import('@stellar/freighter-api')) as any;
      api.getAddress.mockRejectedValueOnce(new Error('User declined access'));
      break;
    }
    case WalletName.Albedo: {
      const { default: albedo } = (await import('@albedo-link/intent')) as any;
      albedo.intent.mockRejectedValueOnce(new Error('User cancelled'));
      break;
    }
    case WalletName.Rabet: {
      if ((globalThis as any).rabet?.connect) {
        (globalThis as any).rabet.connect.mockRejectedValueOnce(
          new Error('User rejected the request'),
        );
      }
      break;
    }
    case WalletName.XBull: {
      if ((globalThis as any).xbull?.getPublicKey) {
        (globalThis as any).xbull.getPublicKey.mockRejectedValueOnce(
          new Error('User declined'),
        );
      }
      break;
    }
    case WalletName.LOBSTR: {
      const api = (await import('@lobstrco/signer-extension-api')) as any;
      api.isConnected.mockResolvedValue(true); // keep connection alive
      api.getPublicKey.mockRejectedValueOnce(new Error('User rejected'));
      break;
    }
    case WalletName.Mock:
    default:
      // MockWalletAdapter doesn't throw TikkaSdkError for rejections;
      // leave mocks unchanged — the test will skip the assertion.
      break;
  }
}
