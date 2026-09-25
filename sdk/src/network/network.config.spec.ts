import { Networks } from '@stellar/stellar-sdk';
import {
  resolveNetworkConfig,
  validateNetworkConfig,
  NETWORK_PRESETS,
  SUPPORTED_NETWORKS,
  type NetworkConfig,
} from './network.config';
import { NetworkConfigError } from './network-config.error';

/**
 * Tests for fail-fast network config validation (issue #1096).
 *
 * The behaviour under test is that a bad config throws at construction with a
 * message naming the offending field — not at the first request, where it is
 * indistinguishable from the endpoint being down.
 */

const validTestnet: NetworkConfig = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
};

describe('network presets', () => {
  it('exposes a preset for every supported network', () => {
    for (const name of SUPPORTED_NETWORKS) {
      expect(NETWORK_PRESETS[name]).toBeDefined();
    }
  });

  it('every shipped preset passes its own validation', () => {
    // Guards against a preset being edited into an invalid state — the presets
    // exist so users never hand-write config, so they must be correct.
    for (const name of SUPPORTED_NETWORKS) {
      expect(() => validateNetworkConfig(NETWORK_PRESETS[name])).not.toThrow();
    }
  });

  it('resolves a preset by name', () => {
    expect(resolveNetworkConfig('testnet')).toEqual(validTestnet);
  });

  it('returns a copy so callers cannot mutate the shared preset', () => {
    const cfg = resolveNetworkConfig('testnet');
    cfg.rpcUrl = 'https://evil.example';
    expect(resolveNetworkConfig('testnet').rpcUrl).toBe('https://soroban-testnet.stellar.org');
  });
});

describe('unknown networks', () => {
  it('rejects an unknown network name and lists the valid ones', () => {
    expect(() => resolveNetworkConfig('mainnnet' as never)).toThrow(NetworkConfigError);
    try {
      resolveNetworkConfig('mainnnet' as never);
    } catch (err) {
      expect((err as NetworkConfigError).field).toBe('network');
      expect((err as Error).message).toContain('testnet');
    }
  });

  it('rejects a config object with an unknown network', () => {
    expect(() => resolveNetworkConfig({ network: 'devnet' as never })).toThrow(NetworkConfigError);
  });
});

describe('URL validation', () => {
  it.each([
    ['not-a-url', 'is not a valid URL'],
    ['', 'must be a non-empty string'],
    ['ftp://example.com', 'must use http or https'],
  ])('rejects rpcUrl %p', (rpcUrl, expected) => {
    expect(() => resolveNetworkConfig({ network: 'testnet', rpcUrl })).toThrow(expected);
  });

  it('names rpcUrl as the offending field', () => {
    try {
      resolveNetworkConfig({ network: 'testnet', rpcUrl: 'nope' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkConfigError);
      expect((err as NetworkConfigError).field).toBe('rpcUrl');
    }
  });

  it('validates horizonUrl as well as rpcUrl', () => {
    try {
      resolveNetworkConfig({ network: 'testnet', horizonUrl: 'nope' });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as NetworkConfigError).field).toBe('horizonUrl');
    }
  });

  it('accepts a valid custom RPC endpoint', () => {
    const cfg = resolveNetworkConfig({
      network: 'testnet',
      rpcUrl: 'https://my-private-rpc.example.com/soroban',
    });
    expect(cfg.rpcUrl).toBe('https://my-private-rpc.example.com/soroban');
    // Unspecified fields still come from the preset.
    expect(cfg.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('accepts http for a local standalone node', () => {
    expect(() => resolveNetworkConfig('standalone')).not.toThrow();
  });
});

describe('passphrase validation', () => {
  it('rejects a passphrase that does not match the named network', () => {
    // The dangerous case: transactions sign against the passphrase, so a
    // mainnet passphrase under a "testnet" label yields mainnet-valid
    // signatures. A typo must not reach that.
    try {
      resolveNetworkConfig({ network: 'testnet', networkPassphrase: Networks.PUBLIC });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkConfigError);
      expect((err as NetworkConfigError).field).toBe('networkPassphrase');
      expect((err as Error).message).toContain('does not match network "testnet"');
    }
  });

  it('rejects an empty passphrase', () => {
    expect(() => resolveNetworkConfig({ network: 'testnet', networkPassphrase: '' })).toThrow(
      NetworkConfigError,
    );
  });

  it('accepts the matching passphrase stated explicitly', () => {
    expect(() =>
      resolveNetworkConfig({ network: 'testnet', networkPassphrase: Networks.TESTNET }),
    ).not.toThrow();
  });
});

describe('NetworkConfigError', () => {
  it('is catchable as NetworkConfigError, not just Error', () => {
    // Extending built-ins breaks the prototype chain under ES5 targets, which
    // would make the typed error untestable by callers.
    const err = new NetworkConfigError('rpcUrl', 'bad', 'is not a valid URL');
    expect(err).toBeInstanceOf(NetworkConfigError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NetworkConfigError');
  });

  it('carries the field and value for programmatic handling', () => {
    const err = new NetworkConfigError('rpcUrl', 'bad', 'is not a valid URL');
    expect(err.field).toBe('rpcUrl');
    expect(err.value).toBe('bad');
  });

  it('renders undefined and empty values readably', () => {
    expect(new NetworkConfigError('x', undefined, 'r').message).toContain('undefined');
    expect(new NetworkConfigError('x', '', 'r').message).toContain('""');
  });
});
