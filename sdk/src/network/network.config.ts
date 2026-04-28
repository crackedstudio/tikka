import { Networks } from '@stellar/stellar-sdk';

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
}

export const DEFAULT_RPC_CONFIG: RpcConfig = {
  headers: {},
  failoverEndpoints: [],
  timeoutMs: 30_000,
  enableRetries: true,
  maxRetryAttempts: 3,
  retryBaseDelayMs: 300,
  retryBackoffFactor: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
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

/**
 * Resolves a NetworkConfig by name, or accepts a custom override.
 */
export function resolveNetworkConfig(
  networkOrConfig: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork }),
): NetworkConfig {
  if (typeof networkOrConfig === 'string') {
    const cfg = NETWORK_CONFIGS[networkOrConfig];
    if (!cfg) throw new Error(`Unknown network: ${networkOrConfig}`);
    return { ...cfg };
  }

  const base = NETWORK_CONFIGS[networkOrConfig.network];
  if (!base) throw new Error(`Unknown network: ${networkOrConfig.network}`);

  return {
    ...base,
    ...networkOrConfig,
  };
}
