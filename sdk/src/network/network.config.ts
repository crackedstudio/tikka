export interface RpcConfig {
  /** Primary RPC endpoint URL */
  endpoint: string;
  /** Custom HTTP headers (e.g. API keys) */
  headers?: Record<string, string>;
  /** Ordered list of fallback endpoints */
  failoverEndpoints?: string[];
  /** Custom fetch-compatible client (e.g. node-fetch, undici) */
  fetchClient?: typeof fetch;
  /** Per-request timeout in ms (default: 30_000) */
  timeoutMs?: number;
}

export const DEFAULT_RPC_CONFIG: RpcConfig = {
  endpoint: 'https://soroban-testnet.stellar.org',
  headers: {},
  failoverEndpoints: [],
  timeoutMs: 30_000,
};
