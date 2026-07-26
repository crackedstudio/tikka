import { Networks } from '@stellar/stellar-sdk';
import { NetworkConfigError } from './network-config.error';

export type TikkaNetwork = 'testnet' | 'mainnet' | 'standalone';

/**
 * High-level network configuration (used across SDK)
 */
export interface NetworkConfig {
  network: TikkaNetwork;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

/**
 * Low-level RPC configuration (customization layer)
 */
export interface RpcConfig {
  /** Primary RPC endpoint URL */
  endpoint?: string;
  /** Custom HTTP headers (e.g. API keys) */
  headers?: Record<string, string>;
  /** Ordered list of fallback endpoints */
  failoverEndpoints?: string[];
  /** Custom fetch-compatible client (e.g. node-fetch, undici) */
  fetchClient?: typeof fetch;
  /** Per-request timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Enable retry strategy for transient errors */
  enableRetries?: boolean;
  /** Max retry attempts per endpoint */
  maxRetryAttempts?: number;
  /** Initial retry delay in milliseconds */
  retryBaseDelayMs?: number;
  /** Exponential backoff factor */
  retryBackoffFactor?: number;
  /** Maximum retry delay in ms (default: 8000) */
  maxRetryDelayMs?: number;
  /** HTTP status codes that should trigger retry */
  retryableStatusCodes?: (number | string)[];
  /** Consecutive failures to trip the circuit breaker (default: 5) */
  circuitBreakerFailureThreshold?: number;
  /** Cooldown time in ms before transitioning from open to half-open (default: 10_000) */
  circuitBreakerResetTimeoutMs?: number;
}

export const SOROBAN_RPC_MAX_RETRIES = 3;
export const SOROBAN_RPC_BASE_DELAY_MS = 300;

export const DEFAULT_RPC_CONFIG: RpcConfig = {
  headers: {},
  failoverEndpoints: [],
  timeoutMs: 30_000,
  enableRetries: true,
  maxRetryAttempts: SOROBAN_RPC_MAX_RETRIES,
  retryBaseDelayMs: SOROBAN_RPC_BASE_DELAY_MS,
  retryBackoffFactor: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504, 'RATE_LIMIT', 'UNAVAILABLE', 'TIMEOUT', 'ECONNRESET'],
  circuitBreakerFailureThreshold: 5,
  circuitBreakerResetTimeoutMs: 10_000,
};

const NETWORK_CONFIGS: Record<TikkaNetwork, NetworkConfig> = {
  testnet: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  },
  mainnet: {
    network: 'mainnet',
    rpcUrl: 'https://soroban.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: Networks.PUBLIC,
  },
  standalone: {
    network: 'standalone',
    rpcUrl: 'http://localhost:8000/soroban/rpc',
    horizonUrl: 'http://localhost:8000',
    networkPassphrase: Networks.STANDALONE,
  },
};

/** Named presets, so most callers never hand-write a config (issue #1096). */
export const NETWORK_PRESETS = Object.freeze({ ...NETWORK_CONFIGS });

/** The network names accepted by `resolveNetworkConfig`. */
export const SUPPORTED_NETWORKS = Object.keys(NETWORK_CONFIGS) as TikkaNetwork[];

/** Passphrase each network must carry, keyed by name. */
const EXPECTED_PASSPHRASES: Record<TikkaNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  standalone: Networks.STANDALONE,
};

/**
 * Validate a fully-resolved network config (issue #1096).
 *
 * Runs at construction rather than at first request. A malformed RPC URL
 * previously surfaced as a fetch failure on the first call — far from the line
 * that actually caused it, and indistinguishable from the endpoint being down.
 *
 * Every failure names the offending field, so the message points at the fix.
 *
 * @throws {NetworkConfigError}
 */
export function validateNetworkConfig(config: NetworkConfig): NetworkConfig {
  if (!config || typeof config !== 'object') {
    throw new NetworkConfigError('config', config, 'must be an object');
  }

  if (!SUPPORTED_NETWORKS.includes(config.network)) {
    throw new NetworkConfigError(
      'network',
      config.network,
      `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
    );
  }

  assertUrl('rpcUrl', config.rpcUrl);
  assertUrl('horizonUrl', config.horizonUrl);

  if (typeof config.networkPassphrase !== 'string' || config.networkPassphrase.trim() === '') {
    throw new NetworkConfigError('networkPassphrase', config.networkPassphrase, 'must be a non-empty string');
  }

  // A passphrase that does not match the named network is the dangerous case:
  // transactions sign against the passphrase, so a mainnet passphrase under a
  // "testnet" label produces signatures valid on mainnet. That must not be
  // reachable by a typo, and it is not something a first request would reveal.
  const expected = EXPECTED_PASSPHRASES[config.network];
  if (config.networkPassphrase !== expected) {
    throw new NetworkConfigError(
      'networkPassphrase',
      config.networkPassphrase,
      `does not match network "${config.network}" (expected: "${expected}")`,
    );
  }

  return config;
}

/** Assert a field is a syntactically valid http(s) URL. */
function assertUrl(field: string, value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NetworkConfigError(field, value, 'must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new NetworkConfigError(field, value, 'is not a valid URL');
  }

  // Anything other than http(s) cannot be fetched. Rejecting here is clearer
  // than letting the transport fail later with a protocol error.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new NetworkConfigError(field, value, 'must use http or https');
  }
}

/**
 * Resolves a NetworkConfig by name, or accepts a custom override.
 *
 * The result is validated before it is returned (issue #1096), so an invalid
 * config fails here rather than on the first request.
 *
 * @throws {NetworkConfigError}
 */
export function resolveNetworkConfig(
  networkOrConfig: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork }),
): NetworkConfig {
  if (typeof networkOrConfig === 'string') {
    const cfg = NETWORK_CONFIGS[networkOrConfig];
    if (!cfg) {
      throw new NetworkConfigError(
        'network',
        networkOrConfig,
        `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
      );
    }
    // Presets are known-good, so this is a copy rather than a re-validation.
    return { ...cfg };
  }

  if (!networkOrConfig || typeof networkOrConfig !== 'object') {
    throw new NetworkConfigError('config', networkOrConfig, 'must be a network name or a config object');
  }

  const base = NETWORK_CONFIGS[networkOrConfig.network];
  if (!base) {
    throw new NetworkConfigError(
      'network',
      networkOrConfig.network,
      `must be one of: ${SUPPORTED_NETWORKS.join(', ')}`,
    );
  }

  // Overrides are validated: spreading user input over a preset is exactly how
  // a bad URL or a mismatched passphrase used to get through unnoticed.
  return validateNetworkConfig({ ...base, ...networkOrConfig });
}
