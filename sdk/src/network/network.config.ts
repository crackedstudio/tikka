import { Networks } from '@stellar/stellar-sdk';

export type TikkaNetwork = 'testnet' | 'mainnet' | 'standalone';

export interface NetworkConfig {
  network: TikkaNetwork;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

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
  networkOrConfig: TikkaNetwork | NetworkConfig,
): NetworkConfig {
  if (typeof networkOrConfig === 'string') {
    const cfg = NETWORK_CONFIGS[networkOrConfig];
    if (!cfg) throw new Error(`Unknown network: ${networkOrConfig}`);
    return cfg;
  }
  return networkOrConfig;
}
