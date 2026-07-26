import { rpc, xdr } from '@stellar/stellar-sdk';
import { DEFAULT_RPC_CONFIG } from '../network/network.config';
import type { NetworkConfig, RpcConfig } from '../network/network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { withRetry } from '../utils/retry';

interface RequestOptions {
  disableRetries?: boolean;
}

/**
 * Browser-friendly RPC service for the light SDK bundle.
 *
 * This implementation is intentionally framework-agnostic and does not
 * rely on NestJS decorators or dependency injection.
 */
export class RpcService {
  private server: rpc.Server;
  private rpcConfig: RpcConfig;

  constructor(
    private readonly networkConfig: NetworkConfig,
    rpcConfig?: RpcConfig,
  ) {
    this.rpcConfig = this.normalizeConfig({
      ...DEFAULT_RPC_CONFIG,
      ...rpcConfig,
      endpoint: rpcConfig?.endpoint ?? networkConfig.rpcUrl,
    });

    this.server = new rpc.Server(networkConfig.rpcUrl, {
      allowHttp: networkConfig.rpcUrl.startsWith('http://'),
    });
  }

  getServer(): rpc.Server {
    return this.server;
  }

  configure(config: Partial<RpcConfig>): void {
    this.rpcConfig = this.normalizeConfig({ ...this.rpcConfig, ...config });
  }

  setEndpoint(url: string): void {
    this.rpcConfig.endpoint = url;
    this.server = new rpc.Server(url, {
      allowHttp: url.startsWith('http://'),
    });
  }

  addFailoverEndpoint(url: string): void {
    if (!this.rpcConfig.failoverEndpoints) {
      this.rpcConfig.failoverEndpoints = [];
    }
    this.rpcConfig.failoverEndpoints.push(url);
  }

  setFetchClient(client: typeof fetch): void {
    this.rpcConfig.fetchClient = client;
  }

  setHeaders(headers: Record<string, string>): void {
    this.rpcConfig.headers = { ...this.rpcConfig.headers, ...headers };
  }

  async simulateTransaction(
    tx: any,
    options: RequestOptions = {},
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.request('simulateTransaction', [tx.toXDR()], options);
  }

  async sendTransaction(
    tx: any,
    options: RequestOptions = {},
  ): Promise<rpc.Api.SendTransactionResponse> {
    return this.request('sendTransaction', [tx.toXDR()], options);
  }

  async getLedger(
    options: RequestOptions = {},
  ): Promise<rpc.Api.GetLatestLedgerResponse> {
    return this.request('getLatestLedger', [], options);
  }

  async getTransaction(
    hash: string,
  ): Promise<rpc.Api.GetTransactionResponse> {
    return this.request('getTransaction', [hash]);
  }

  async estimateFee(_operation?: xdr.Operation): Promise<{ minFee: number; suggestedFee: number }> {
    const fetchClient = this.resolveFetchClient();
    try {
      const response = await fetchClient(`${this.networkConfig.horizonUrl}/fee_stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch fee stats: ${response.statusText}`);
      }
      const stats = await response.json();
      return {
        minFee: Number(stats.fee_charged?.min ?? 100),
        suggestedFee: Number(stats.fee_charged?.p90 ?? 100),
      };
    } catch (err: any) {
      console.warn(`[RpcService] estimateFee failed, falling back to 100 stroops: ${err.message}`);
      return { minFee: 100, suggestedFee: 100 };
    }
  }

  private async request<T>(
    method: string,
    params: any[] = [],
    options: RequestOptions = {},
  ): Promise<T> {
    const endpoints = [
      this.rpcConfig.endpoint ?? this.networkConfig.rpcUrl,
      ...(this.rpcConfig.failoverEndpoints || []),
    ];
    let lastError: any = null;

    for (const url of endpoints) {
      try {
        return await this.executeRequest<T>(url, method, params, options);
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (lastError instanceof TikkaSdkError) throw lastError;
    throw new TikkaSdkError(
      TikkaSdkErrorCode.NetworkError,
      `RPC request failed for all endpoints. Last error: ${lastError?.message ?? lastError}`,
      lastError,
    );
  }

  private async executeRequest<T>(
    url: string,
    method: string,
    params: any[],
    options: RequestOptions = {},
  ): Promise<T> {
    const retriesEnabled = this.rpcConfig.enableRetries !== false && !options.disableRetries;

    if (!retriesEnabled) {
      return this.executeSingleRequest<T>(url, method, params);
    }

    return withRetry(
      () => this.executeSingleRequest<T>(url, method, params),
      {
        maxAttempts: this.rpcConfig.maxRetryAttempts ?? 3,
        baseDelayMs: this.rpcConfig.retryBaseDelayMs ?? 500,
        maxDelayMs: this.rpcConfig.maxRetryDelayMs ?? 8000,
        retryOn: this.rpcConfig.retryableStatusCodes ?? [503, 429, 'ECONNRESET'],
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[RpcService] ${method} retry ${attempt} in ${Math.round(delay)}ms (${url}): ${error?.message ?? error}`,
          );
        },
      },
    );
  }

  private async executeSingleRequest<T>(
    url: string,
    method: string,
    params: any[],
  ): Promise<T> {
    const fetchClient = this.resolveFetchClient();
    const timeoutMs = this.rpcConfig.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchClient(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.rpcConfig.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.NetworkError,
          `RPC request failed: ${response.statusText}`,
          { status: response.status },
        );
      }

      const payload = await response.json();
      if (payload.error) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.SimulationFailed,
          payload.error.message || 'Unknown RPC error',
          payload.error,
        );
      }

      return payload.result as T;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.Timeout,
          `Request timed out after ${timeoutMs}ms`,
          error,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveFetchClient(): typeof fetch {
    if (this.rpcConfig.fetchClient) return this.rpcConfig.fetchClient;
    const runtimeFetch = (globalThis as any).fetch;
    if (typeof runtimeFetch === 'function') {
      return runtimeFetch;
    }
    throw new TikkaSdkError(
      TikkaSdkErrorCode.NetworkError,
      'No fetch implementation found. Provide rpcConfig.fetchClient (required in some browser-like or Node runtimes).',
    );
  }

  private normalizeConfig(config: RpcConfig): RpcConfig {
    return {
      ...config,
      failoverEndpoints: [...(config.failoverEndpoints ?? [])],
      retryableStatusCodes: [...(config.retryableStatusCodes ?? [])],
    };
  }
}
